use crate::{Block, Document, Node, Pair, Trivia};

pub(crate) fn write_document(doc: &Document, out: &mut String) {
    let nl = if doc.crlf { "\r\n" } else { "\n" };
    let mut doc_start = true;
    for node in &doc.nodes {
        write_node(node, 0, doc_start, nl, out);
        doc_start = false;
    }
    match &doc.trailing {
        Some(t) => out.push_str(t),
        // Hammer ends every file with a newline. An empty document stays empty.
        None if !doc.nodes.is_empty() => out.push_str(nl),
        None => {}
    }
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push('\t');
    }
}

/// Writes stored trivia, or Hammer's default: a newline (except at the very
/// start of the document) followed by one tab per depth.
fn write_leading(
    leading: &Option<Trivia>,
    depth: usize,
    doc_start: bool,
    nl: &str,
    out: &mut String,
) {
    match leading {
        Some(s) => out.push_str(s),
        None => {
            if !doc_start {
                out.push_str(nl);
            }
            indent(out, depth);
        }
    }
}

fn write_node(node: &Node, depth: usize, doc_start: bool, nl: &str, out: &mut String) {
    match node {
        Node::Pair(p) => write_pair(p, depth, doc_start, nl, out),
        Node::Block(b) => write_block(b, depth, doc_start, nl, out),
    }
}

fn write_pair(p: &Pair, depth: usize, doc_start: bool, nl: &str, out: &mut String) {
    write_leading(&p.leading, depth, doc_start, nl, out);
    p.key.write_raw(out);
    match &p.sep {
        Some(s) => out.push_str(s),
        None => out.push(' '),
    }
    p.value.write_raw(out);
    if let Some(c) = &p.cond {
        out.push_str(&c.ws);
        out.push_str(&c.raw);
    }
}

fn write_block(b: &Block, depth: usize, doc_start: bool, nl: &str, out: &mut String) {
    write_leading(&b.leading, depth, doc_start, nl, out);
    b.key.write_raw(out);
    if let Some(c) = &b.cond {
        out.push_str(&c.ws);
        out.push_str(&c.raw);
    }
    match &b.open_ws {
        Some(s) => out.push_str(s),
        None => {
            out.push_str(nl);
            indent(out, depth);
        }
    }
    out.push('{');
    for child in &b.children {
        write_node(child, depth + 1, false, nl, out);
    }
    match &b.close_leading {
        Some(s) => out.push_str(s),
        None => {
            out.push_str(nl);
            indent(out, depth);
        }
    }
    out.push('}');
}

#[cfg(test)]
mod tests {
    use crate::{Block, Document, NodeList, Pair};

    #[test]
    fn new_document_is_formatted_like_hammer() {
        let mut doc = Document::new();
        let mut vi = Block::new("versioninfo");
        vi.push(Pair::new("editorversion", "400"));
        vi.push(Pair::new("editorbuild", "8864"));
        doc.push(vi);
        doc.push(Block::new("visgroups"));
        let mut world = Block::new("world");
        world.push(Pair::new("id", "1"));
        let mut solid = Block::new("solid");
        solid.push(Pair::new("id", "2"));
        world.push(solid);
        doc.push(world);

        let expected = "versioninfo\n{\n\t\"editorversion\" \"400\"\n\t\"editorbuild\" \"8864\"\n}\nvisgroups\n{\n}\nworld\n{\n\t\"id\" \"1\"\n\tsolid\n\t{\n\t\t\"id\" \"2\"\n\t}\n}\n";
        assert_eq!(doc.to_string(), expected);
    }

    #[test]
    fn added_nodes_follow_the_source_line_endings() {
        let src = "world\r\n{\r\n\t\"id\" \"1\"\r\n}\r\n";
        let mut doc = Document::parse(src).unwrap();
        assert!(doc.crlf);
        assert_eq!(doc.to_string(), src);
        doc.block_mut("world")
            .unwrap()
            .set_value("skyname", "sky_day01_01");
        let mut e = Block::new("entity");
        e.push(Pair::new("id", "2"));
        doc.push(e);
        assert_eq!(
            doc.to_string(),
            "world\r\n{\r\n\t\"id\" \"1\"\r\n\t\"skyname\" \"sky_day01_01\"\r\n}\r\nentity\r\n{\r\n\t\"id\" \"2\"\r\n}\r\n"
        );
    }
}
