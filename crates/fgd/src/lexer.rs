//! Tokens of an FGD file.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Tok {
    /// `@Name`
    At(String),
    /// Bare word, number or path.
    Word(String),
    /// `"..."`, unquoted; adjacent strings joined by `+` are merged by the parser.
    Str(String),
    LParen,
    RParen,
    LBracket,
    RBracket,
    Eq,
    Colon,
    Comma,
    Plus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub tok: Tok,
    pub line: usize,
}

pub fn tokenize(text: &str) -> Vec<Token> {
    let mut out = Vec::new();
    let mut chars = text.char_indices().peekable();
    let mut line = 1usize;
    while let Some((i, c)) = chars.next() {
        match c {
            '\n' => line += 1,
            c if c.is_whitespace() => {}
            '/' if matches!(chars.peek(), Some((_, '/'))) => {
                for (_, c2) in chars.by_ref() {
                    if c2 == '\n' {
                        line += 1;
                        break;
                    }
                }
            }
            '"' => {
                let start = i + 1;
                let mut end = start;
                let start_line = line;
                for (j, c2) in chars.by_ref() {
                    if c2 == '"' {
                        end = j;
                        break;
                    }
                    if c2 == '\n' {
                        line += 1;
                    }
                    end = j + c2.len_utf8();
                }
                out.push(Token {
                    tok: Tok::Str(text[start..end].to_string()),
                    line: start_line,
                });
            }
            '@' => {
                let start = i + 1;
                let mut end = start;
                while let Some(&(j, c2)) = chars.peek() {
                    if c2.is_alphanumeric() || c2 == '_' {
                        end = j + c2.len_utf8();
                        chars.next();
                    } else {
                        break;
                    }
                }
                out.push(Token {
                    tok: Tok::At(text[start..end].to_string()),
                    line,
                });
            }
            '(' => out.push(Token {
                tok: Tok::LParen,
                line,
            }),
            ')' => out.push(Token {
                tok: Tok::RParen,
                line,
            }),
            '[' => out.push(Token {
                tok: Tok::LBracket,
                line,
            }),
            ']' => out.push(Token {
                tok: Tok::RBracket,
                line,
            }),
            '=' => out.push(Token { tok: Tok::Eq, line }),
            ':' => out.push(Token {
                tok: Tok::Colon,
                line,
            }),
            ',' => out.push(Token {
                tok: Tok::Comma,
                line,
            }),
            '+' => out.push(Token {
                tok: Tok::Plus,
                line,
            }),
            _ => {
                let start = i;
                let mut end = i + c.len_utf8();
                while let Some(&(j, c2)) = chars.peek() {
                    if c2.is_whitespace()
                        || matches!(
                            c2,
                            '(' | ')' | '[' | ']' | '=' | ':' | ',' | '"' | '+' | '@'
                        )
                    {
                        break;
                    }
                    if c2 == '/' {
                        // `//` starts a comment; a lone slash is part of a path.
                        let mut look = chars.clone();
                        look.next();
                        if matches!(look.peek(), Some((_, '/'))) {
                            break;
                        }
                    }
                    end = j + c2.len_utf8();
                    chars.next();
                }
                out.push(Token {
                    tok: Tok::Word(text[start..end].to_string()),
                    line,
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens() {
        let t = tokenize("@PointClass base(A, B) size(-8 -8 -8, 8 8 8) = name : \"a \"+\n\"b\" // c\n[ k(integer) : \"K\" : -1 ]");
        let kinds: Vec<&Tok> = t.iter().map(|x| &x.tok).collect();
        assert_eq!(kinds[0], &Tok::At("PointClass".into()));
        assert_eq!(kinds[1], &Tok::Word("base".into()));
        assert_eq!(kinds[5], &Tok::Word("B".into()));
        assert!(kinds.contains(&&Tok::Word("-8".into())));
        assert!(kinds.contains(&&Tok::Str("a ".into())));
        assert!(kinds.contains(&&Tok::Plus));
        assert_eq!(t.last().unwrap().line, 3);
        assert_eq!(kinds.last().unwrap(), &&Tok::RBracket);
    }

    #[test]
    fn paths_with_slashes_are_words_and_comments_are_skipped() {
        let t = tokenize("studio(models/x.mdl) // note\nnext");
        let words: Vec<String> = t
            .iter()
            .filter_map(|x| match &x.tok {
                Tok::Word(w) => Some(w.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(words, vec!["studio", "models/x.mdl", "next"]);
    }
}
