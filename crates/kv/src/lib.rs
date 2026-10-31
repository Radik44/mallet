//! Lossless parser and writer for Valve's KeyValues text format.
//!
//! This is the foundation of the editor: VMF map sources, VMT materials,
//! `gameinfo.txt` and `mount.cfg` are all KeyValues dialects. The crate keeps
//! everything the source file contained (whitespace, comments, quoting style,
//! the exact text of numbers), so a document that is parsed and written back
//! without edits is byte-for-byte identical. Values that *are* edited are
//! re-quoted; nodes that are *added* are formatted the way Hammer formats them
//! (tabs, block keys bare, pair keys and values quoted).
//!
//! Escape sequences are intentionally not interpreted: Source parses VMF, VMT
//! and gameinfo files without escapes, so a backslash is just a character and
//! a quote always terminates a quoted token.
//!
//! ```
//! use kv::{Document, NodeList};
//!
//! let src = "versioninfo\n{\n\t\"editorversion\" \"400\"\n}\n";
//! let mut doc = Document::parse(src).unwrap();
//! assert_eq!(doc.to_string(), src);
//!
//! doc.block_mut("versioninfo").unwrap().set_value("editorversion", "401");
//! assert_eq!(doc.block("versioninfo").unwrap().value("editorversion"), Some("401"));
//! ```

#![forbid(unsafe_code)]

mod error;
mod parse;
mod write;

use std::borrow::Cow;
use std::fmt;

use compact_str::CompactString;

pub use error::{Error, ErrorKind, Result};

/// Whitespace and comments kept between tokens. Short runs (Hammer's
/// newline plus tabs) live inline without a heap allocation.
pub type Trivia = CompactString;

/// A key or value as it appeared in the source: the text without quotes and
/// whether it was quoted. The source spelling is exactly `"text"` or `text`,
/// so nothing else needs storing for a byte-identical round trip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    text: CompactString,
    quoted: bool,
}

impl Token {
    /// A quoted token: `"text"`. This is how Hammer writes pair keys and values.
    pub fn quoted(text: impl Into<String>) -> Token {
        Token {
            text: CompactString::from(text.into()),
            quoted: true,
        }
    }

    /// A bare (unquoted) token, the way Hammer writes block keys such as
    /// `world` or `solid`. Falls back to quoting when the text cannot be a
    /// bare token (whitespace, braces, quotes, leading `[`, `//`).
    pub fn bare(text: impl Into<String>) -> Token {
        let text = text.into();
        let quoted = needs_quotes(&text);
        Token {
            text: CompactString::from(text),
            quoted,
        }
    }

    pub(crate) fn from_raw(raw: &str) -> Token {
        if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
            Token {
                text: CompactString::from(&raw[1..raw.len() - 1]),
                quoted: true,
            }
        } else {
            Token {
                text: CompactString::from(raw),
                quoted: false,
            }
        }
    }

    /// The token without quotes.
    pub fn text(&self) -> &str {
        &self.text
    }

    /// The token exactly as written in the source, quotes included.
    pub fn raw(&self) -> Cow<'_, str> {
        if self.quoted {
            Cow::Owned(quote(&self.text))
        } else {
            Cow::Borrowed(&self.text)
        }
    }

    /// Appends the token as written in the source, quotes included.
    pub fn write_raw(&self, out: &mut String) {
        if self.quoted {
            out.push('"');
            out.push_str(&self.text);
            out.push('"');
        } else {
            out.push_str(&self.text);
        }
    }

    pub fn is_quoted(&self) -> bool {
        self.quoted
    }

    /// True for an unquoted conditional such as `[$WIN32]`.
    pub(crate) fn is_conditional(&self) -> bool {
        !self.quoted && self.text.starts_with('[')
    }

    /// Replaces the text. The quoting style is kept when possible: a quoted
    /// token stays quoted, a bare token stays bare unless the new text needs
    /// quotes.
    pub fn set_text(&mut self, text: impl Into<String>) {
        let text = text.into();
        self.quoted = self.quoted || needs_quotes(&text);
        self.text = CompactString::from(text);
    }
}

fn quote(text: &str) -> String {
    let mut s = String::with_capacity(text.len() + 2);
    s.push('"');
    s.push_str(text);
    s.push('"');
    s
}

fn needs_quotes(text: &str) -> bool {
    text.is_empty()
        || text.starts_with('[')
        || text.contains("//")
        || text
            .chars()
            .any(|c| c.is_whitespace() || matches!(c, '{' | '}' | '"'))
}

/// A conditional suffix such as `[$WIN32]` or `[!$X360]`, with the whitespace
/// that preceded it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cond {
    pub ws: Trivia,
    pub raw: Trivia,
}

impl Cond {
    pub fn new(raw: impl Into<String>) -> Cond {
        Cond {
            ws: Trivia::from(" "),
            raw: Trivia::from(raw.into()),
        }
    }
}

/// `"key" "value"`, optionally followed by a conditional.
///
/// `leading` is the whitespace and comments before the key; `sep` is the
/// whitespace between key and value. `None` means "format like Hammer" when
/// writing, which is what newly created nodes use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pair {
    pub leading: Option<Trivia>,
    pub key: Token,
    pub sep: Option<Trivia>,
    pub value: Token,
    /// Boxed: conditionals are rare, and an inline one would widen every node by 48 bytes.
    pub cond: Option<Box<Cond>>,
}

impl Pair {
    /// A new Hammer-style pair: both key and value quoted.
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Pair {
        Pair {
            leading: None,
            key: Token::quoted(key),
            sep: None,
            value: Token::quoted(value),
            cond: None,
        }
    }
}

/// `key { ... }`, optionally with a conditional between key and brace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Block {
    pub leading: Option<Trivia>,
    pub key: Token,
    pub cond: Option<Box<Cond>>,
    /// Whitespace between the key (or conditional) and `{`.
    pub open_ws: Option<Trivia>,
    pub children: Vec<Node>,
    /// Whitespace and comments before `}`.
    pub close_leading: Option<Trivia>,
}

impl Block {
    /// A new Hammer-style block with a bare key and no children.
    pub fn new(key: impl Into<String>) -> Block {
        Block {
            leading: None,
            key: Token::bare(key),
            cond: None,
            open_ws: None,
            children: Vec::new(),
            close_leading: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    Pair(Pair),
    Block(Block),
}

impl Node {
    pub fn key(&self) -> &str {
        match self {
            Node::Pair(p) => p.key.text(),
            Node::Block(b) => b.key.text(),
        }
    }

    pub fn as_pair(&self) -> Option<&Pair> {
        match self {
            Node::Pair(p) => Some(p),
            Node::Block(_) => None,
        }
    }

    pub fn as_block(&self) -> Option<&Block> {
        match self {
            Node::Block(b) => Some(b),
            Node::Pair(_) => None,
        }
    }

    pub fn as_block_mut(&mut self) -> Option<&mut Block> {
        match self {
            Node::Block(b) => Some(b),
            Node::Pair(_) => None,
        }
    }

    /// Structural equality that ignores whitespace, comments and quoting.
    pub fn semantic_eq(&self, other: &Node) -> bool {
        match (self, other) {
            (Node::Pair(a), Node::Pair(b)) => {
                a.key.text() == b.key.text()
                    && a.value.text() == b.value.text()
                    && cond_eq(&a.cond, &b.cond)
            }
            (Node::Block(a), Node::Block(b)) => {
                a.key.text() == b.key.text()
                    && cond_eq(&a.cond, &b.cond)
                    && semantic_eq_nodes(&a.children, &b.children)
            }
            _ => false,
        }
    }
}

fn cond_eq(a: &Option<Box<Cond>>, b: &Option<Box<Cond>>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => a.raw == b.raw,
        _ => false,
    }
}

/// Structural equality of two node lists, ignoring formatting.
pub fn semantic_eq_nodes(a: &[Node], b: &[Node]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.semantic_eq(y))
}

impl From<Pair> for Node {
    fn from(p: Pair) -> Node {
        Node::Pair(p)
    }
}

impl From<Block> for Node {
    fn from(b: Block) -> Node {
        Node::Block(b)
    }
}

/// A whole KeyValues file: a sequence of top-level nodes plus whatever
/// whitespace and comments followed the last one.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Document {
    pub nodes: Vec<Node>,
    pub trailing: Option<Trivia>,
    /// The source used Windows line endings, so nodes added later are
    /// written with `\r\n` too (Hammer on Windows writes CRLF).
    pub crlf: bool,
}

impl Document {
    pub fn new() -> Document {
        Document::default()
    }

    /// Parses a KeyValues text. Nothing is lost: `doc.to_string() == src`.
    pub fn parse(src: &str) -> Result<Document> {
        parse::parse(src)
    }

    /// Structural equality that ignores whitespace, comments and quoting.
    pub fn semantic_eq(&self, other: &Document) -> bool {
        semantic_eq_nodes(&self.nodes, &other.nodes)
    }
}

impl fmt::Display for Document {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut out = String::new();
        write::write_document(self, &mut out);
        f.write_str(&out)
    }
}

/// Shared read and write API for anything holding a list of nodes: the
/// document itself and every block. Key lookup is case-insensitive, as in the
/// engine.
pub trait NodeList {
    fn nodes(&self) -> &[Node];
    fn nodes_mut(&mut self) -> &mut Vec<Node>;

    /// First node with this key.
    fn get(&self, key: &str) -> Option<&Node> {
        self.nodes()
            .iter()
            .find(|n| n.key().eq_ignore_ascii_case(key))
    }

    fn get_mut(&mut self, key: &str) -> Option<&mut Node> {
        self.nodes_mut()
            .iter_mut()
            .find(|n| n.key().eq_ignore_ascii_case(key))
    }

    /// Text of the first pair with this key.
    fn value(&self, key: &str) -> Option<&str> {
        self.nodes().iter().find_map(|n| match n {
            Node::Pair(p) if p.key.text().eq_ignore_ascii_case(key) => Some(p.value.text()),
            _ => None,
        })
    }

    /// First block with this key.
    fn block(&self, key: &str) -> Option<&Block> {
        self.nodes().iter().find_map(|n| match n {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case(key) => Some(b),
            _ => None,
        })
    }

    fn block_mut(&mut self, key: &str) -> Option<&mut Block> {
        self.nodes_mut().iter_mut().find_map(|n| match n {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case(key) => Some(b),
            _ => None,
        })
    }

    /// All blocks with this key, in order. VMF repeats keys freely (`solid`,
    /// `side`, `entity`), so this is the common way to walk a map.
    fn blocks<'a>(&'a self, key: &'a str) -> Box<dyn Iterator<Item = &'a Block> + 'a> {
        Box::new(self.nodes().iter().filter_map(move |n| match n {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case(key) => Some(b),
            _ => None,
        }))
    }

    /// All pairs, in order.
    fn pairs(&self) -> Box<dyn Iterator<Item = &Pair> + '_> {
        Box::new(self.nodes().iter().filter_map(|n| n.as_pair()))
    }

    /// Sets the first pair with this key, or appends a new Hammer-style pair.
    fn set_value(&mut self, key: &str, value: impl Into<String>) -> &mut Pair {
        let nodes = self.nodes_mut();
        let idx = nodes.iter().position(|n| match n {
            Node::Pair(p) => p.key.text().eq_ignore_ascii_case(key),
            Node::Block(_) => false,
        });
        let idx = match idx {
            Some(i) => i,
            None => {
                nodes.push(Node::Pair(Pair::new(key, "")));
                nodes.len() - 1
            }
        };
        match &mut nodes[idx] {
            Node::Pair(p) => {
                p.value.set_text(value);
                p
            }
            Node::Block(_) => unreachable!("index points at a pair"),
        }
    }

    fn push(&mut self, node: impl Into<Node>) {
        self.nodes_mut().push(node.into());
    }

    /// Removes every node with this key and returns how many were removed.
    fn remove_all(&mut self, key: &str) -> usize {
        let nodes = self.nodes_mut();
        let before = nodes.len();
        nodes.retain(|n| !n.key().eq_ignore_ascii_case(key));
        before - nodes.len()
    }
}

impl NodeList for Document {
    fn nodes(&self) -> &[Node] {
        &self.nodes
    }
    fn nodes_mut(&mut self) -> &mut Vec<Node> {
        &mut self.nodes
    }
}

impl NodeList for Block {
    fn nodes(&self) -> &[Node] {
        &self.children
    }
    fn nodes_mut(&mut self) -> &mut Vec<Node> {
        &mut self.children
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_token_falls_back_to_quotes_when_needed() {
        assert_eq!(Token::bare("world").raw(), "world");
        assert_eq!(Token::bare("two words").raw(), "\"two words\"");
        assert_eq!(Token::bare("").raw(), "\"\"");
        assert_eq!(Token::bare("[$WIN32]").raw(), "\"[$WIN32]\"");
        assert_eq!(Token::bare("a//b").raw(), "\"a//b\"");
    }

    #[test]
    fn set_text_keeps_quoting_style() {
        let mut quoted = Token::quoted("1");
        quoted.set_text("2");
        assert_eq!(quoted.raw(), "\"2\"");

        let mut bare = Token::bare("game");
        bare.set_text("game2");
        assert_eq!(bare.raw(), "game2");
        bare.set_text("needs quotes");
        assert_eq!(bare.raw(), "\"needs quotes\"");
    }

    #[test]
    fn from_raw_strips_quotes() {
        let t = Token::from_raw("\"abc\"");
        assert_eq!(t.text(), "abc");
        assert!(t.is_quoted());
        let t = Token::from_raw("abc");
        assert_eq!(t.text(), "abc");
        assert!(!t.is_quoted());
        // A lone quote character is not a quoted token.
        assert_eq!(Token::from_raw("\"").text(), "\"");
    }

    #[test]
    fn set_value_updates_or_appends() {
        let mut b = Block::new("world");
        b.set_value("skyname", "sky_day01_01");
        b.set_value("skyname", "sky_day02_01");
        b.set_value("maxpropscreenwidth", "-1");
        assert_eq!(b.children.len(), 2);
        assert_eq!(b.value("SKYNAME"), Some("sky_day02_01"));
        assert_eq!(b.value("maxpropscreenwidth"), Some("-1"));
    }

    #[test]
    fn remove_all_counts() {
        let mut b = Block::new("x");
        b.push(Pair::new("a", "1"));
        b.push(Pair::new("A", "2"));
        b.push(Pair::new("b", "3"));
        assert_eq!(b.remove_all("a"), 2);
        assert_eq!(b.children.len(), 1);
    }
}
