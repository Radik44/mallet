use kv::{Block, Document, NodeList, Pair};

const FIXTURES: &[&str] = &[
    "hammer_room.vmf",
    "material.vmt",
    "gameinfo.txt",
    "mount.cfg",
    "odd_whitespace.kv",
];

fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{}", env!("CARGO_MANIFEST_DIR"), name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"))
}

#[test]
fn every_fixture_round_trips_byte_for_byte() {
    for name in FIXTURES {
        let src = fixture(name);
        let doc = Document::parse(&src).unwrap_or_else(|e| panic!("{name}: {e}"));
        assert_eq!(doc.to_string(), src, "{name} changed after parse + write");
    }
}

#[test]
fn crlf_line_endings_are_preserved() {
    for name in FIXTURES {
        let src = fixture(name).replace('\n', "\r\n");
        let doc = Document::parse(&src).unwrap();
        assert_eq!(doc.to_string(), src, "{name} with CRLF");
    }
}

#[test]
fn reparsing_the_output_is_semantically_identical() {
    for name in FIXTURES {
        let a = Document::parse(&fixture(name)).unwrap();
        let b = Document::parse(&a.to_string()).unwrap();
        assert!(a.semantic_eq(&b), "{name}");
        assert_eq!(a, b, "{name}");
    }
}

#[test]
fn vmf_structure_is_accessible() {
    let doc = Document::parse(&fixture("hammer_room.vmf")).unwrap();

    assert_eq!(
        doc.block("versioninfo").unwrap().value("editorversion"),
        Some("400")
    );
    assert_eq!(
        doc.block("visgroups")
            .unwrap()
            .block("visgroup")
            .unwrap()
            .value("name"),
        Some("Detail")
    );

    let world = doc.block("world").unwrap();
    assert_eq!(world.value("classname"), Some("worldspawn"));
    assert_eq!(world.blocks("solid").count(), 2);
    let first = world.block("solid").unwrap();
    assert_eq!(first.blocks("side").count(), 6);
    assert_eq!(
        first.block("side").unwrap().value("plane"),
        Some("(-512 512 -64) (512 512 -64) (512 -512 -64)")
    );

    // Displacement rows keep their exact numeric text.
    let disp = world
        .blocks("solid")
        .nth(1)
        .unwrap()
        .block("side")
        .unwrap()
        .block("dispinfo")
        .unwrap();
    assert_eq!(disp.value("power"), Some("2"));
    assert_eq!(
        disp.block("distances").unwrap().value("row1"),
        Some("0 4.5 8 4.5 0")
    );

    let entities: Vec<&Block> = doc.blocks("entity").collect();
    assert_eq!(entities.len(), 2);
    let button = entities[1];
    assert_eq!(button.value("classname"), Some("func_button"));
    let outputs: Vec<&Pair> = button.block("connections").unwrap().pairs().collect();
    assert_eq!(outputs.len(), 2);
    assert_eq!(outputs[0].key.text(), "OnPressed");
    assert_eq!(outputs[1].value.text(), "sound_1,PlaySound,,0.5,-1");

    // Hidden entities live under a `hidden` block.
    let hidden = doc.block("hidden").unwrap().block("entity").unwrap();
    assert_eq!(hidden.value("classname"), Some("light"));
    assert_eq!(
        hidden.block("editor").unwrap().value("logicalpos"),
        Some("[0 1500]")
    );

    assert_eq!(
        doc.block("cameras")
            .unwrap()
            .block("camera")
            .unwrap()
            .value("position"),
        Some("[-300.5 420.25 180]")
    );
}

#[test]
fn vmt_dialect_is_accessible() {
    let doc = Document::parse(&fixture("material.vmt")).unwrap();
    let mat = doc.block("LightmappedGeneric").unwrap();
    assert_eq!(
        mat.value("$basetexture"),
        Some("concrete/concretefloor001a")
    );
    // Case-insensitive, like the engine.
    assert_eq!(
        mat.value("$BASETEXTURE"),
        Some("concrete/concretefloor001a")
    );
    // Bare keys and bare numeric values.
    assert_eq!(mat.value("$detail"), Some("detail/noise_detail_01"));
    assert_eq!(mat.value("$detailblendfactor"), Some(".5"));
    // Conditional on a pair and on a block.
    let bump = mat.pairs().find(|p| p.key.text() == "$bumpmap").unwrap();
    assert_eq!(bump.cond.as_ref().unwrap().raw, "[$WIN32]");
    let dx = mat.block(">=DX90").unwrap();
    assert_eq!(dx.cond.as_ref().unwrap().raw, "[$WIN32]");
    assert_eq!(
        mat.block("Proxies")
            .unwrap()
            .block("TextureScroll")
            .unwrap()
            .value("texturescrollrate"),
        Some("0.25")
    );
}

#[test]
fn gameinfo_and_mount_cfg_are_accessible() {
    let gi = Document::parse(&fixture("gameinfo.txt")).unwrap();
    let root = gi.block("GameInfo").unwrap();
    assert_eq!(root.value("game"), Some("Garry's Mod"));
    assert_eq!(root.value("type"), Some("multiplayer_only"));
    let fs = root.block("FileSystem").unwrap();
    assert_eq!(fs.value("SteamAppId"), Some("4000"));
    let paths: Vec<(&str, &str)> = fs
        .block("SearchPaths")
        .unwrap()
        .pairs()
        .map(|p| (p.key.text(), p.value.text()))
        .collect();
    assert_eq!(paths[0], ("game+mod", "|gameinfo_path|."));
    assert_eq!(paths.len(), 6);

    let mount = Document::parse(&fixture("mount.cfg")).unwrap();
    let cfg = mount.block("mountcfg").unwrap();
    // Commented-out entries are trivia, not pairs.
    assert_eq!(cfg.pairs().count(), 1);
    // Backslashes are plain characters, no escape processing.
    assert_eq!(
        cfg.value("tf"),
        Some(r"D:\SteamLibrary\steamapps\common\Team Fortress 2\tf")
    );
}

#[test]
fn editing_one_value_changes_exactly_one_line() {
    let src = fixture("hammer_room.vmf");
    let mut doc = Document::parse(&src).unwrap();
    doc.block_mut("world")
        .unwrap()
        .set_value("skyname", "sky_day02_01");
    let out = doc.to_string();

    let diff: Vec<(&str, &str)> = src
        .lines()
        .zip(out.lines())
        .filter(|(a, b)| a != b)
        .collect();
    assert_eq!(src.lines().count(), out.lines().count());
    assert_eq!(
        diff,
        vec![(
            "\t\"skyname\" \"sky_day01_01\"",
            "\t\"skyname\" \"sky_day02_01\""
        )]
    );
}

#[test]
fn appended_nodes_match_hammer_indentation() {
    let src = fixture("hammer_room.vmf");
    let mut doc = Document::parse(&src).unwrap();

    let world = doc.block_mut("world").unwrap();
    world.set_value("comment", "added");
    let mut solid = Block::new("solid");
    solid.push(Pair::new("id", "99"));
    world.push(solid);

    let out = doc.to_string();
    assert!(out
        .contains("\n\t\"comment\" \"added\"\n\tsolid\n\t{\n\t\t\"id\" \"99\"\n\t}\n}\nentity\n"));
    // Everything before the edit point is untouched.
    let cut = src.find("\tgroup\n").unwrap();
    assert_eq!(&out[..cut], &src[..cut]);
}

#[test]
fn removing_a_block_keeps_the_rest_intact() {
    let src = fixture("hammer_room.vmf");
    let mut doc = Document::parse(&src).unwrap();
    assert_eq!(doc.remove_all("hidden"), 1);
    let out = doc.to_string();
    assert!(!out.contains("hidden"));
    assert!(out.ends_with("cordons\n{\n\t\"active\" \"0\"\n}\n"));
    assert_eq!(Document::parse(&out).unwrap().blocks("entity").count(), 2);
}

#[test]
fn display_of_parse_errors_is_readable() {
    let e = Document::parse("world\n{\n\t\"id\" \"1\"\n").unwrap_err();
    assert_eq!(e.to_string(), "4:1: unexpected end of file, expected '}'");
}
