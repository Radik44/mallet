use geometry::Vec3;
use vmf::Map;

fn fixture() -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../kv/tests/fixtures/hammer_room.vmf"
    );
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn round_trips_through_the_typed_layer() {
    let src = fixture();
    let map = Map::parse(&src).unwrap();
    assert_eq!(map.to_string(), src);
    assert!(map.warnings.is_empty(), "{:?}", map.warnings);
}

#[test]
fn header_blocks() {
    let map = Map::parse(&fixture()).unwrap();
    assert_eq!(map.versioninfo.editor_version, 400);
    assert_eq!(map.versioninfo.editor_build, 8864);
    assert_eq!(map.versioninfo.map_version, 3);
    assert!(!map.versioninfo.prefab);

    assert_eq!(map.visgroups.len(), 1);
    assert_eq!(map.visgroups[0].name, "Detail");
    assert_eq!(map.visgroups[0].id, 1);
    assert_eq!(
        (
            map.visgroups[0].color.r,
            map.visgroups[0].color.g,
            map.visgroups[0].color.b
        ),
        (162, 79, 240)
    );

    assert!(map.viewsettings.snap_to_grid);
    assert_eq!(map.viewsettings.grid_spacing, 64);
    assert!(!map.viewsettings.show_3d_grid);
}

#[test]
fn world_solids_and_sides() {
    let map = Map::parse(&fixture()).unwrap();
    let w = &map.world;
    assert_eq!(w.id, 1);
    assert_eq!(w.get("classname"), Some("worldspawn"));
    assert_eq!(w.skyname(), Some("sky_day01_01"));
    assert_eq!(w.solids.len(), 2);
    assert_eq!(w.groups.len(), 1);
    assert_eq!(w.groups[0].id, 40);

    let floor = &w.solids[0];
    assert_eq!(floor.id, 2);
    assert_eq!(floor.sides.len(), 6);
    assert!(!floor.hidden);
    let top = &floor.sides[0];
    assert_eq!(top.id, 1);
    assert_eq!(top.material, "DEV/DEV_MEASUREGENERIC01B");
    assert_eq!(top.plane_points[0], Vec3::new(-512.0, 512.0, -64.0));
    let plane = top.plane.unwrap();
    assert!((plane.normal - Vec3::Z).length() < 1e-12);
    assert_eq!(plane.dist, -64.0);
    assert_eq!(top.uaxis.axis, Vec3::X);
    assert_eq!(top.vaxis.axis, -Vec3::Y);
    assert_eq!(top.uaxis.scale, 0.25);
    assert_eq!(top.lightmap_scale, 16);
    assert_eq!(top.smoothing_groups, 0);
    assert!(top.dispinfo.is_none());
    assert_eq!(
        (
            floor.editor.color.r,
            floor.editor.color.g,
            floor.editor.color.b
        ),
        (0, 180, 0)
    );

    // The brush is a valid closed box.
    let g = floor.geometry();
    assert!(g.is_valid(), "{:?}", g.problems);
    let (lo, hi) = g.bounds().unwrap();
    assert_eq!(lo, Vec3::new(-512.0, -512.0, -128.0));
    assert_eq!(hi, Vec3::new(512.0, 512.0, -64.0));
}

#[test]
fn displacement_rows() {
    let map = Map::parse(&fixture()).unwrap();
    let disp_side = &map.world.solids[1].sides[0];
    let d = disp_side.dispinfo.as_ref().unwrap();
    assert_eq!(d.power, 2);
    assert_eq!(d.verts_per_edge(), 5);
    assert_eq!(d.start_position, Vec3::new(-64.0, -64.0, 0.0));
    assert_eq!(d.normals.len(), 5);
    assert_eq!(d.normals[0].len(), 5);
    assert_eq!(d.normals[0][0], Vec3::Z);
    assert_eq!(d.distances[2][2], 16.0);
    assert_eq!(d.distances[1][1], 4.5);
    assert_eq!(d.alphas[2][2], 255.0);
    assert!(d.offsets.is_empty());
    assert_eq!(map.world.solids[1].editor.visgroup_ids, vec![1]);
}

#[test]
fn entities_connections_and_hidden() {
    let map = Map::parse(&fixture()).unwrap();
    assert_eq!(map.entities.len(), 3);

    let start = &map.entities[0];
    assert_eq!(start.classname, "info_player_start");
    assert_eq!(start.origin(), Some(Vec3::new(0.0, 0.0, -56.0)));
    assert_eq!(start.angles(), Some(Vec3::new(0.0, 90.0, 0.0)));
    assert!(!start.is_brush_entity());
    assert_eq!(start.editor.logical_pos, Some([0.0, 500.0]));

    let button = &map.entities[1];
    assert_eq!(button.classname, "func_button");
    assert_eq!(button.targetname(), Some("button_1"));
    assert_eq!(button.get("spawnflags"), Some("1025"));
    assert!(button.is_brush_entity());
    assert_eq!(button.solids[0].id, 61);
    assert_eq!(button.connections.len(), 2);
    assert_eq!(button.connections[1].target, "sound_1");
    assert_eq!(button.connections[1].input, "PlaySound");
    assert_eq!(button.connections[1].delay, 0.5);
    assert_eq!(button.connections[1].times_to_fire, -1);

    let light = &map.entities[2];
    assert!(light.hidden);
    assert_eq!(light.classname, "light");
    assert!(!light.editor.visgroup_shown);

    assert_eq!(map.entities_of_class("LIGHT").count(), 1);
    assert_eq!(map.entity_by_id(60).unwrap().classname, "func_button");
    assert_eq!(map.solids().count(), 3);
    assert_eq!(map.max_id(), 70);
}

#[test]
fn cameras_and_cordons() {
    let map = Map::parse(&fixture()).unwrap();
    assert_eq!(map.cameras.len(), 1);
    assert_eq!(map.active_camera, Some(0));
    assert_eq!(map.cameras[0].position, Vec3::new(-300.5, 420.25, 180.0));
    assert!(map.cordons.is_empty());
    assert!(!map.cordons_active);
}

#[test]
fn modern_and_legacy_cordons() {
    let modern = "world\n{\n}\ncordons\n{\n\t\"active\" \"1\"\n\tcordon\n\t{\n\t\t\"name\" \"c1\"\n\t\t\"active\" \"1\"\n\t\tbox\n\t\t{\n\t\t\t\"mins\" \"(-64 -64 -64)\"\n\t\t\t\"maxs\" \"(64 64 64)\"\n\t\t}\n\t}\n}\n";
    let map = Map::parse(modern).unwrap();
    assert!(map.cordons_active);
    assert_eq!(map.cordons.len(), 1);
    assert_eq!(map.cordons[0].name, "c1");
    assert_eq!(map.cordons[0].maxs, Vec3::new(64.0, 64.0, 64.0));

    let legacy = "world\n{\n}\ncordon\n{\n\t\"mins\" \"(-1 -1 -1)\"\n\t\"maxs\" \"(1 1 1)\"\n\t\"active\" \"0\"\n}\n";
    let map = Map::parse(legacy).unwrap();
    assert!(!map.cordons_active);
    assert_eq!(map.cordons[0].mins, Vec3::new(-1.0, -1.0, -1.0));
}

#[test]
fn malformed_values_become_warnings_not_errors() {
    let src = "world\n{\n\t\"id\" \"1\"\n\tsolid\n\t{\n\t\t\"id\" \"2\"\n\t\tside\n\t\t{\n\t\t\t\"id\" \"3\"\n\t\t\t\"plane\" \"(0 0 0) (1 1 1)\"\n\t\t\t\"uaxis\" \"garbage\"\n\t\t\t\"lightmapscale\" \"x\"\n\t\t}\n\t}\n}\nentity\n{\n\t\"id\" \"4\"\n\tconnections\n\t{\n\t\t\"OnX\" \"nocomma\"\n\t}\n}\n";
    let map = Map::parse(src).unwrap();
    assert_eq!(map.to_string(), src);
    let messages: Vec<String> = map.warnings.iter().map(|w| w.to_string()).collect();
    assert!(
        messages.iter().any(|m| m.starts_with("[id 3] bad plane")),
        "{messages:?}"
    );
    assert!(
        messages.iter().any(|m| m.contains("bad uaxis")),
        "{messages:?}"
    );
    assert!(
        messages
            .iter()
            .any(|m| m.contains("bad integer lightmapscale")),
        "{messages:?}"
    );
    assert!(
        messages
            .iter()
            .any(|m| m.contains("unparseable connection")),
        "{messages:?}"
    );
    assert!(
        messages.iter().any(|m| m.contains("without classname")),
        "{messages:?}"
    );
    // Defaults were applied.
    let side = &map.world.solids[0].sides[0];
    assert_eq!(side.lightmap_scale, 16);
    assert_eq!(side.uaxis.scale, 0.25);
    assert!(side.plane.is_none());
}

#[test]
fn missing_world_is_fatal() {
    assert_eq!(
        Map::parse("versioninfo\n{\n}\n").unwrap_err(),
        vmf::Error::NoWorld
    );
    assert!(matches!(
        Map::parse("world\n{\n").unwrap_err(),
        vmf::Error::Syntax(_)
    ));
}
