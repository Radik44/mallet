//! Property tests: any tree we can build writes to text that parses back to
//! the same tree, and writing that parse again gives the same bytes.

use kv::{Block, Cond, Document, Node, Pair};
use proptest::prelude::*;

fn key() -> impl Strategy<Value = String> {
    // Bare-safe keys so blocks exercise the unquoted path too.
    "[a-zA-Z_$%][a-zA-Z0-9_$%+.]{0,9}"
}

fn value() -> impl Strategy<Value = String> {
    // Anything but a double quote; quoting makes the rest safe.
    "[^\"]{0,16}"
}

fn cond() -> impl Strategy<Value = Option<Cond>> {
    prop_oneof![
        4 => Just(None),
        1 => Just(Some(Cond::new("[$WIN32]"))),
        1 => Just(Some(Cond::new("[!$X360]"))),
    ]
}

fn pair() -> impl Strategy<Value = Node> {
    (key(), value(), cond()).prop_map(|(k, v, c)| {
        let mut p = Pair::new(k, v);
        p.cond = c.map(Box::new);
        Node::Pair(p)
    })
}

fn node() -> impl Strategy<Value = Node> {
    pair().prop_recursive(4, 48, 6, |inner| {
        (key(), cond(), prop::collection::vec(inner, 0..6)).prop_map(|(k, c, children)| {
            let mut b = Block::new(k);
            b.cond = c.map(Box::new);
            b.children = children;
            Node::Block(b)
        })
    })
}

fn document() -> impl Strategy<Value = Document> {
    prop::collection::vec(node(), 0..6).prop_map(|nodes| Document {
        nodes,
        trailing: None,
        crlf: false,
    })
}

proptest! {
    #[test]
    fn write_parse_write_is_stable(doc in document()) {
        let text = doc.to_string();
        let parsed = Document::parse(&text).unwrap();
        prop_assert!(parsed.semantic_eq(&doc), "semantic mismatch for:\n{text}");
        prop_assert_eq!(parsed.to_string(), text);
    }

    #[test]
    fn arbitrary_text_never_panics(s in "[ -~\\t\\r\\n]{0,64}") {
        let _ = Document::parse(&s);
    }

    #[test]
    fn whatever_parses_round_trips(s in "[a-z{}\" \\n\\t/$\\[\\]!]{0,40}") {
        if let Ok(doc) = Document::parse(&s) {
            prop_assert_eq!(doc.to_string(), s);
        }
    }
}
