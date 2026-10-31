//! Recursive-descent parser over the token stream. Recovers at the next `@`.

use crate::lexer::{tokenize, Tok, Token};
use crate::{Choice, Class, ClassKind, Flag, Helper, Io, Key, Warning};

type Parsed = (Vec<Class>, Vec<String>, Option<(i64, i64)>, Vec<Warning>);

pub fn parse_str(text: &str) -> Parsed {
    let tokens = tokenize(text);
    let mut p = Parser {
        toks: &tokens,
        pos: 0,
        warnings: Vec::new(),
    };
    let mut classes = Vec::new();
    let mut includes = Vec::new();
    let mut map_size = None;

    while let Some(t) = p.peek() {
        let line = t.line;
        match &t.tok {
            Tok::At(name) => {
                let name_l = name.to_ascii_lowercase();
                p.pos += 1;
                match name_l.as_str() {
                    "include" => match p.take_str() {
                        Some(s) => includes.push(s),
                        None => p.warn(line, "@include without a file name"),
                    },
                    "mapsize" => {
                        if p.eat(&Tok::LParen) {
                            let a = p.take_word().and_then(|w| w.parse::<i64>().ok());
                            p.eat(&Tok::Comma);
                            let b = p.take_word().and_then(|w| w.parse::<i64>().ok());
                            p.eat(&Tok::RParen);
                            if let (Some(a), Some(b)) = (a, b) {
                                map_size = Some((a, b));
                            } else {
                                p.warn(line, "bad @mapsize");
                            }
                        }
                    }
                    "baseclass" | "pointclass" | "solidclass" | "npcclass" | "keyframeclass"
                    | "moveclass" | "filterclass" => {
                        let kind = match name_l.as_str() {
                            "baseclass" => ClassKind::Base,
                            "pointclass" => ClassKind::Point,
                            "solidclass" => ClassKind::Solid,
                            "npcclass" => ClassKind::Npc,
                            "keyframeclass" => ClassKind::KeyFrame,
                            "moveclass" => ClassKind::Move,
                            _ => ClassKind::Filter,
                        };
                        match p.class(kind, line) {
                            Some(c) => classes.push(c),
                            None => p.recover(),
                        }
                    }
                    "materialexclusion" | "autovisgroup" => {
                        // `@MaterialExclusion [ ... ]`, `@AutoVisGroup = "Name" [ ... ]`
                        p.skip_until_at();
                    }
                    other => {
                        p.warn(line, format!("unknown directive @{other}"));
                        p.skip_until_at();
                    }
                }
            }
            _ => {
                p.warn(line, format!("unexpected {:?} at top level", t.tok));
                p.recover();
            }
        }
    }
    (classes, includes, map_size, p.warnings)
}

struct Parser<'a> {
    toks: &'a [Token],
    pos: usize,
    warnings: Vec<Warning>,
}

impl Parser<'_> {
    fn peek(&self) -> Option<&Token> {
        self.toks.get(self.pos)
    }

    fn peek_tok(&self) -> Option<&Tok> {
        self.peek().map(|t| &t.tok)
    }

    fn line(&self) -> usize {
        self.peek().map(|t| t.line).unwrap_or(0)
    }

    fn warn(&mut self, line: usize, message: impl Into<String>) {
        self.warnings.push(Warning {
            file: None,
            line,
            message: message.into(),
        });
    }

    fn eat(&mut self, tok: &Tok) -> bool {
        if self.peek_tok() == Some(tok) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn take_word(&mut self) -> Option<String> {
        match self.peek_tok() {
            Some(Tok::Word(w)) => {
                let w = w.clone();
                self.pos += 1;
                Some(w)
            }
            _ => None,
        }
    }

    /// One or more strings joined with `+`.
    fn take_str(&mut self) -> Option<String> {
        let mut out = match self.peek_tok() {
            Some(Tok::Str(s)) => {
                let s = s.clone();
                self.pos += 1;
                s
            }
            _ => return None,
        };
        while self.eat(&Tok::Plus) {
            match self.peek_tok() {
                Some(Tok::Str(s)) => {
                    out.push_str(s);
                    self.pos += 1;
                }
                _ => break,
            }
        }
        Some(out)
    }

    /// A string or a word (numbers, bare identifiers), as text.
    fn take_value(&mut self) -> Option<String> {
        self.take_str().or_else(|| self.take_word())
    }

    /// Skips to the next `@` directive.
    fn skip_until_at(&mut self) {
        while let Some(t) = self.peek() {
            if matches!(t.tok, Tok::At(_)) {
                break;
            }
            self.pos += 1;
        }
    }

    fn recover(&mut self) {
        // Do not get stuck on the token that caused the problem.
        if matches!(self.peek_tok(), Some(Tok::At(_))) {
            self.pos += 1;
        }
        self.skip_until_at();
    }

    fn class(&mut self, kind: ClassKind, line: usize) -> Option<Class> {
        let mut helpers = Vec::new();
        let mut bases = Vec::new();
        // Helpers until `=`.
        loop {
            match self.peek_tok() {
                Some(Tok::Eq) => {
                    self.pos += 1;
                    break;
                }
                Some(Tok::Word(_)) => {
                    let name = self.take_word()?;
                    let mut args: Vec<Vec<String>> = Vec::new();
                    if self.eat(&Tok::LParen) {
                        let mut group: Vec<String> = Vec::new();
                        loop {
                            match self.peek_tok() {
                                Some(Tok::RParen) => {
                                    self.pos += 1;
                                    break;
                                }
                                Some(Tok::Comma) => {
                                    self.pos += 1;
                                    args.push(std::mem::take(&mut group));
                                }
                                Some(Tok::Word(w)) => {
                                    group.push(w.clone());
                                    self.pos += 1;
                                }
                                Some(Tok::Str(s)) => {
                                    group.push(s.clone());
                                    self.pos += 1;
                                }
                                Some(Tok::Colon) | Some(Tok::Eq) | Some(Tok::Plus) => {
                                    // Odd but seen: tolerate punctuation inside helper args.
                                    self.pos += 1;
                                }
                                _ => {
                                    self.warn(line, format!("unterminated helper {name}("));
                                    return None;
                                }
                            }
                        }
                        if !group.is_empty() || !args.is_empty() {
                            args.push(group);
                        }
                    }
                    if name.eq_ignore_ascii_case("base") {
                        bases.extend(args.iter().flatten().cloned());
                    }
                    helpers.push(Helper { name, args });
                }
                _ => {
                    self.warn(line, "class without `=`");
                    return None;
                }
            }
        }

        let name = match self.take_word() {
            Some(n) => n,
            None => {
                self.warn(line, "class without a name");
                return None;
            }
        };
        let mut description = String::new();
        if self.eat(&Tok::Colon) {
            description = self.take_str().unwrap_or_default();
        }

        let mut class = Class {
            kind,
            name,
            description,
            bases,
            helpers,
            keys: Vec::new(),
            inputs: Vec::new(),
            outputs: Vec::new(),
        };

        if !self.eat(&Tok::LBracket) {
            // Body-less classes exist in the wild.
            return Some(class);
        }
        loop {
            match self.peek_tok() {
                None => {
                    self.warn(line, format!("class {} not closed", class.name));
                    return Some(class);
                }
                Some(Tok::RBracket) => {
                    self.pos += 1;
                    return Some(class);
                }
                Some(Tok::Word(w))
                    if w.eq_ignore_ascii_case("input") || w.eq_ignore_ascii_case("output") =>
                {
                    let is_input = w.eq_ignore_ascii_case("input");
                    self.pos += 1;
                    match self.io() {
                        Some(io) => {
                            if is_input {
                                class.inputs.push(io);
                            } else {
                                class.outputs.push(io);
                            }
                        }
                        None => {
                            let l = self.line();
                            self.warn(l, format!("bad input/output in {}", class.name));
                            self.skip_entry();
                        }
                    }
                }
                Some(Tok::Word(_)) => match self.key() {
                    Some(k) => class.keys.push(k),
                    None => {
                        let l = self.line();
                        self.warn(l, format!("bad key in {}", class.name));
                        self.skip_entry();
                    }
                },
                Some(other) => {
                    let l = self.line();
                    self.warn(l, format!("unexpected {other:?} in {}", class.name));
                    self.pos += 1;
                }
            }
        }
    }

    /// Skips tokens up to the next plausible entry start inside a body.
    fn skip_entry(&mut self) {
        let mut depth = 0i32;
        while let Some(t) = self.peek() {
            match t.tok {
                Tok::LBracket => depth += 1,
                Tok::RBracket => {
                    if depth == 0 {
                        return;
                    }
                    depth -= 1;
                }
                _ => {}
            }
            self.pos += 1;
            if depth == 0 {
                if let Some(Tok::Word(w)) = self.peek_tok() {
                    // Next entry: `name(` or input/output.
                    let is_entry = self
                        .toks
                        .get(self.pos + 1)
                        .map(|t| t.tok == Tok::LParen)
                        .unwrap_or(false)
                        || w.eq_ignore_ascii_case("input")
                        || w.eq_ignore_ascii_case("output");
                    if is_entry {
                        return;
                    }
                }
            }
        }
    }

    fn io(&mut self) -> Option<Io> {
        let name = self.take_word()?;
        if !self.eat(&Tok::LParen) {
            return None;
        }
        let ty = self.take_word().unwrap_or_default().to_ascii_lowercase();
        if !self.eat(&Tok::RParen) {
            return None;
        }
        let mut help = String::new();
        if self.eat(&Tok::Colon) {
            help = self.take_str().unwrap_or_default();
        }
        Some(Io { name, ty, help })
    }

    fn key(&mut self) -> Option<Key> {
        let name = self.take_word()?;
        if !self.eat(&Tok::LParen) {
            return None;
        }
        // `*studio` marks the key whose model the studio helper previews.
        let ty = self
            .take_word()
            .unwrap_or_default()
            .trim_start_matches('*')
            .to_ascii_lowercase();
        if !self.eat(&Tok::RParen) {
            return None;
        }
        let mut key = Key {
            name,
            ty,
            display: String::new(),
            default: None,
            help: String::new(),
            readonly: false,
            report: false,
            choices: Vec::new(),
            flags: Vec::new(),
        };
        // Modifiers: readonly, report.
        while let Some(Tok::Word(w)) = self.peek_tok() {
            match w.to_ascii_lowercase().as_str() {
                "readonly" => key.readonly = true,
                "report" => key.report = true,
                _ => break,
            }
            self.pos += 1;
        }
        // : "Display" : default : "Help"  (each part optional)
        if self.eat(&Tok::Colon) {
            key.display = self.take_str().unwrap_or_default();
            if self.eat(&Tok::Colon) {
                key.default = self.take_value();
                if self.eat(&Tok::Colon) {
                    key.help = self.take_str().unwrap_or_default();
                }
            }
        }
        if self.eat(&Tok::Eq) {
            if !self.eat(&Tok::LBracket) {
                return None;
            }
            loop {
                match self.peek_tok() {
                    Some(Tok::RBracket) => {
                        self.pos += 1;
                        break;
                    }
                    None => return None,
                    _ => {}
                }
                let value = self.take_value()?;
                let mut display = String::new();
                let mut default = None;
                if self.eat(&Tok::Colon) {
                    display = self.take_str().unwrap_or_default();
                    if self.eat(&Tok::Colon) {
                        default = self.take_value();
                    }
                }
                if key.ty == "flags" {
                    let bit = value.parse::<u32>().unwrap_or(0);
                    let on = default.as_deref().map(|d| d.trim() != "0").unwrap_or(false);
                    key.flags.push(Flag {
                        bit,
                        display,
                        default: on,
                    });
                } else {
                    key.choices.push(Choice { value, display });
                }
            }
        }
        Some(key)
    }
}
