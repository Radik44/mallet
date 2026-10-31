use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorKind {
    /// A `"` opened a token that never closed.
    UnterminatedString,
    /// The file ended where something else was expected.
    UnexpectedEof { expected: &'static str },
    /// A character appeared where it cannot: a stray `}` at top level, a `{`
    /// without a key before it, or something other than `{` after a
    /// conditional.
    UnexpectedChar { found: char, expected: &'static str },
    /// A key followed by `}` instead of a value or block.
    MissingValue { key: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub kind: ErrorKind,
    /// 1-based line.
    pub line: usize,
    /// 1-based column, in characters.
    pub col: usize,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}: ", self.line, self.col)?;
        match &self.kind {
            ErrorKind::UnterminatedString => write!(f, "unterminated quoted string"),
            ErrorKind::UnexpectedEof { expected } => {
                write!(f, "unexpected end of file, expected {expected}")
            }
            ErrorKind::UnexpectedChar { found, expected } => {
                write!(f, "unexpected '{found}', expected {expected}")
            }
            ErrorKind::MissingValue { key } => {
                write!(f, "key \"{key}\" has no value or block")
            }
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
