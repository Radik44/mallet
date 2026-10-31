use crate::{Block, Cond, Document, Error, ErrorKind, Node, Pair, Result, Token, Trivia};

pub(crate) fn parse(src: &str) -> Result<Document> {
    let mut p = Parser { src, pos: 0 };
    let (nodes, trailing) = p.parse_nodes(0)?;
    Ok(Document {
        nodes,
        trailing: Some(Trivia::from(trailing)),
        crlf: src.contains("\r\n"),
    })
}

struct Parser<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn rest(&self) -> &'a str {
        &self.src[self.pos..]
    }

    fn peek(&self) -> Option<char> {
        self.rest().chars().next()
    }

    fn error(&self, kind: ErrorKind) -> Error {
        let (line, col) = line_col(self.src, self.pos);
        Error { kind, line, col }
    }

    fn eof_error(&self, expected: &'static str) -> Error {
        self.error(ErrorKind::UnexpectedEof { expected })
    }

    /// Skips whitespace (including a BOM) and `//` comments, returning the
    /// skipped text so it can be stored as trivia.
    fn skip_trivia(&mut self) -> &'a str {
        let start = self.pos;
        loop {
            let rest = self.rest();
            match rest.chars().next() {
                Some(c) if c.is_whitespace() || c == '\u{FEFF}' => {
                    self.pos += c.len_utf8();
                }
                Some(_) if rest.starts_with("//") => {
                    // Leave the newline for the next iteration so CRLF stays intact.
                    let end = rest.find('\n').unwrap_or(rest.len());
                    self.pos += end;
                }
                _ => break,
            }
        }
        &self.src[start..self.pos]
    }

    /// Reads one token: a quoted string, a conditional `[...]`, or a bare word.
    /// The caller guarantees the next character is not whitespace, `{`, `}` or
    /// the start of a comment.
    fn read_token(&mut self) -> Result<Token> {
        let rest = self.rest();
        let first = match rest.chars().next() {
            Some(c) => c,
            None => return Err(self.eof_error("a key or value")),
        };

        let len = if first == '"' {
            match rest[1..].find('"') {
                Some(i) => i + 2,
                None => return Err(self.error(ErrorKind::UnterminatedString)),
            }
        } else if first == '[' {
            let mut end = rest.len();
            for (i, c) in rest.char_indices().skip(1) {
                if c == ']' {
                    end = i + 1;
                    break;
                }
                if c.is_whitespace() || matches!(c, '{' | '}' | '"') {
                    end = i;
                    break;
                }
            }
            end
        } else {
            let mut end = rest.len();
            for (i, c) in rest.char_indices() {
                if c.is_whitespace() || matches!(c, '{' | '}' | '"') || rest[i..].starts_with("//")
                {
                    end = i;
                    break;
                }
            }
            end
        };

        let raw = &rest[..len];
        self.pos += len;
        Ok(Token::from_raw(raw))
    }

    fn parse_block_body(&mut self, depth: usize) -> Result<(Vec<Node>, String)> {
        debug_assert_eq!(self.peek(), Some('{'));
        self.pos += 1;
        self.parse_nodes(depth + 1)
    }

    /// Parses nodes until `}` (depth > 0) or end of file (depth 0). Returns
    /// the nodes and the trivia before the closing brace or end of file. The
    /// closing brace itself is consumed.
    fn parse_nodes(&mut self, depth: usize) -> Result<(Vec<Node>, String)> {
        let mut nodes = Vec::new();
        loop {
            let leading = self.skip_trivia().to_string();
            match self.peek() {
                None => {
                    if depth == 0 {
                        return Ok((nodes, leading));
                    }
                    return Err(self.eof_error("'}'"));
                }
                Some('}') => {
                    if depth == 0 {
                        return Err(self.error(ErrorKind::UnexpectedChar {
                            found: '}',
                            expected: "a key",
                        }));
                    }
                    self.pos += 1;
                    nodes.shrink_to_fit();
                    return Ok((nodes, leading));
                }
                Some('{') => {
                    return Err(self.error(ErrorKind::UnexpectedChar {
                        found: '{',
                        expected: "a key before '{'",
                    }));
                }
                Some(_) => {}
            }

            let key = self.read_token()?;
            let ws1 = self.skip_trivia().to_string();

            let node = match self.peek() {
                None => return Err(self.eof_error("a value or '{'")),
                Some('{') => {
                    let (children, close_leading) = self.parse_block_body(depth)?;
                    Node::Block(Block {
                        leading: Some(Trivia::from(leading)),
                        key,
                        cond: None,
                        open_ws: Some(Trivia::from(ws1)),
                        children,
                        close_leading: Some(Trivia::from(close_leading)),
                    })
                }
                Some('}') => {
                    return Err(self.error(ErrorKind::MissingValue {
                        key: key.text().to_string(),
                    }))
                }
                Some(_) => {
                    let tok = self.read_token()?;
                    if tok.is_conditional() {
                        // key [$COND] { ... }
                        let ws2 = self.skip_trivia().to_string();
                        match self.peek() {
                            Some('{') => {
                                let (children, close_leading) = self.parse_block_body(depth)?;
                                Node::Block(Block {
                                    leading: Some(Trivia::from(leading)),
                                    key,
                                    cond: Some(Box::new(Cond {
                                        ws: Trivia::from(ws1),
                                        raw: Trivia::from(tok.raw().as_ref()),
                                    })),
                                    open_ws: Some(Trivia::from(ws2)),
                                    children,
                                    close_leading: Some(Trivia::from(close_leading)),
                                })
                            }
                            Some(c) => {
                                return Err(self.error(ErrorKind::UnexpectedChar {
                                    found: c,
                                    expected: "'{' after conditional",
                                }))
                            }
                            None => return Err(self.eof_error("'{' after conditional")),
                        }
                    } else {
                        // "key" "value" [$COND]?
                        let save = self.pos;
                        let ws2 = self.skip_trivia();
                        let cond = if self.peek() == Some('[') {
                            let ws2 = ws2.to_string();
                            let c = self.read_token()?;
                            Some(Box::new(Cond {
                                ws: Trivia::from(ws2),
                                raw: Trivia::from(c.raw().as_ref()),
                            }))
                        } else {
                            self.pos = save;
                            None
                        };
                        Node::Pair(Pair {
                            leading: Some(Trivia::from(leading)),
                            key,
                            sep: Some(Trivia::from(ws1)),
                            value: tok,
                            cond,
                        })
                    }
                }
            };
            nodes.push(node);
        }
    }
}

fn line_col(src: &str, pos: usize) -> (usize, usize) {
    let before = &src[..pos];
    let line = before.matches('\n').count() + 1;
    let col = before
        .rsplit('\n')
        .next()
        .map(|l| l.chars().count())
        .unwrap_or(0)
        + 1;
    (line, col)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NodeList;

    #[test]
    fn parses_pairs_and_blocks() {
        let doc = parse("a\n{\n\t\"k\" \"v\"\n\tb { \"x\" 1 }\n}\n").unwrap();
        let a = doc.block("a").unwrap();
        assert_eq!(a.value("k"), Some("v"));
        assert_eq!(a.block("b").unwrap().value("x"), Some("1"));
    }

    #[test]
    fn conditional_after_value_and_after_key() {
        let doc = parse("\"k\" \"v\" [$WIN32]\nb [!$X360]\n{\n}\n").unwrap();
        let k = doc.nodes[0].as_pair().unwrap();
        assert_eq!(k.cond.as_ref().unwrap().raw, "[$WIN32]");
        let b = doc.nodes[1].as_block().unwrap();
        assert_eq!(b.cond.as_ref().unwrap().raw, "[!$X360]");
        assert_eq!(b.cond.as_ref().unwrap().ws, " ");
    }

    #[test]
    fn comment_right_after_bare_value_ends_the_token() {
        let doc = parse("k v// note\n").unwrap();
        assert_eq!(doc.value("k"), Some("v"));
        assert_eq!(doc.trailing.as_deref(), Some("// note\n"));
    }

    #[test]
    fn quoted_value_may_start_with_bracket() {
        // Hammer writes "logicalpos" "[0 500]" inside editor blocks.
        let doc = parse("\"logicalpos\" \"[0 500]\"\n").unwrap();
        let p = doc.nodes[0].as_pair().unwrap();
        assert_eq!(p.value.text(), "[0 500]");
        assert!(p.cond.is_none());
    }

    #[test]
    fn bom_is_kept_as_trivia() {
        let src = "\u{FEFF}\"a\" \"b\"\n";
        let doc = parse(src).unwrap();
        assert_eq!(
            doc.nodes[0].as_pair().unwrap().leading.as_deref(),
            Some("\u{FEFF}")
        );
        assert_eq!(doc.to_string(), src);
    }

    #[test]
    fn error_positions() {
        let e = parse("a\n{\n").unwrap_err();
        assert_eq!(e.kind, ErrorKind::UnexpectedEof { expected: "'}'" });
        assert_eq!((e.line, e.col), (3, 1));

        let e = parse("\n  }").unwrap_err();
        assert!(matches!(
            e.kind,
            ErrorKind::UnexpectedChar { found: '}', .. }
        ));
        assert_eq!((e.line, e.col), (2, 3));

        let e = parse("a { b }").unwrap_err();
        assert_eq!(e.kind, ErrorKind::MissingValue { key: "b".into() });

        let e = parse("\"open").unwrap_err();
        assert_eq!(e.kind, ErrorKind::UnterminatedString);

        let e = parse("{ }").unwrap_err();
        assert!(matches!(
            e.kind,
            ErrorKind::UnexpectedChar { found: '{', .. }
        ));

        let e = parse("a [$X] \"v\"").unwrap_err();
        assert!(matches!(
            e.kind,
            ErrorKind::UnexpectedChar { found: '"', .. }
        ));

        let e = parse("key").unwrap_err();
        assert_eq!(
            e.kind,
            ErrorKind::UnexpectedEof {
                expected: "a value or '{'"
            }
        );
    }

    #[test]
    fn empty_input_is_an_empty_document() {
        let doc = parse("").unwrap();
        assert!(doc.nodes.is_empty());
        assert_eq!(doc.to_string(), "");
    }
}
