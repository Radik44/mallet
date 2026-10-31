//! Turns a parsed map into one indexed triangle mesh grouped by material,
//! plus what an editor viewport needs on top of pixels: a face table for
//! picking and a wireframe edge list for the 2D views.
//!
//! Vertex layout: position (3), normal (3), texel coordinates (2), face id
//! (1). Texel coordinates are `p · axis / scale + shift` from the side's
//! texture axes; dividing by the texture size in the shader gives UVs, so
//! the mesh does not need to know texture sizes. The face id indexes
//! [`Mesh::face_table`], which maps back to solid and side ids.
//!
//! Brushes with displacements render only their displacement faces, as in
//! the engine; the other sides of such a brush are skipped.

use std::collections::{HashMap, HashSet};

use geometry::Vec3;
use vmf::{DispInfo, Map, Side};

/// One rendered face.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FaceRecord {
    /// Index into [`Mesh::solid_ids`].
    pub solid_index: u32,
    pub solid_id: u32,
    pub side_id: u32,
    /// Index into [`Mesh::materials`].
    pub material: u32,
}

#[derive(Debug, Default, Clone)]
pub struct Mesh {
    /// Materials in draw-range order, lowercase as written in the VMF.
    pub materials: Vec<String>,
    /// xyz per vertex.
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    /// Texel coordinates per vertex.
    pub texcoords: Vec<f32>,
    /// WorldVertexTransition blend per vertex, 0..1 (0 off displacements).
    pub alphas: Vec<f32>,
    /// Luxel coordinates per vertex: world units along the texture axes
    /// divided by the face's lightmap scale, for the lightmap grid view.
    pub luxels: Vec<f32>,
    /// Face id per vertex, indexing `face_table`.
    pub face_ids: Vec<u32>,
    pub indices: Vec<u32>,
    /// `(material index, first index, index count)` per material.
    pub ranges: Vec<(u32, u32, u32)>,
    pub face_table: Vec<FaceRecord>,
    /// VMF id of every emitted solid, by solid index.
    pub solid_ids: Vec<u32>,
    /// Wireframe: xyz, xyz per edge (line list).
    pub edges: Vec<f32>,
    /// Solid index per edge vertex.
    pub edge_solids: Vec<u32>,
    pub faces: usize,
    pub solids: usize,
    pub invalid_solids: usize,
    pub displacement_faces: usize,
    /// Axis-aligned bounds of everything emitted.
    pub bounds: Option<(Vec3, Vec3)>,
}

struct Bucket {
    positions: Vec<f32>,
    normals: Vec<f32>,
    texcoords: Vec<f32>,
    alphas: Vec<f32>,
    luxels: Vec<f32>,
    face_ids: Vec<u32>,
    indices: Vec<u32>,
}

impl Bucket {
    fn new() -> Bucket {
        Bucket {
            positions: Vec::new(),
            normals: Vec::new(),
            texcoords: Vec::new(),
            alphas: Vec::new(),
            luxels: Vec::new(),
            face_ids: Vec::new(),
            indices: Vec::new(),
        }
    }

    fn vertex_count(&self) -> u32 {
        (self.positions.len() / 3) as u32
    }

    fn push_vertex(&mut self, p: Vec3, n: Vec3, side: &Side, face_id: u32) {
        self.push_vertex_alpha(p, n, side, face_id, 0.0);
    }

    fn push_vertex_alpha(&mut self, p: Vec3, n: Vec3, side: &Side, face_id: u32, alpha: f32) {
        self.positions
            .extend_from_slice(&[p.x as f32, p.y as f32, p.z as f32]);
        self.normals
            .extend_from_slice(&[n.x as f32, n.y as f32, n.z as f32]);
        self.texcoords
            .extend_from_slice(&[side.uaxis.texel(p) as f32, side.vaxis.texel(p) as f32]);
        self.alphas.push(alpha);
        let ls = side.lightmap_scale.max(1) as f64;
        self.luxels.extend_from_slice(&[
            (p.dot(side.uaxis.axis) / ls) as f32,
            (p.dot(side.vaxis.axis) / ls) as f32,
        ]);
        self.face_ids.push(face_id);
    }
}

pub fn build(map: &Map) -> Mesh {
    let mut buckets: Vec<(String, Bucket)> = Vec::new();
    let mut by_material: HashMap<String, usize> = HashMap::new();
    let mut mesh = Mesh::default();
    let mut lo = Vec3::splat(f64::INFINITY);
    let mut hi = Vec3::splat(f64::NEG_INFINITY);

    let visible_solids = map.world.solids.iter().filter(|s| !s.hidden).chain(
        map.entities
            .iter()
            .filter(|e| !e.hidden)
            .flat_map(|e| e.solids.iter()),
    );
    for solid in visible_solids {
        let solid_index = mesh.solid_ids.len() as u32;
        mesh.solid_ids.push(solid.id);
        mesh.solids += 1;
        let g = solid.geometry();
        if !g.is_valid() {
            mesh.invalid_solids += 1;
        }
        let has_disp = solid.sides.iter().any(|s| s.dispinfo.is_some());

        // Wireframe edges from the welded brush vertices, each once.
        let mut seen: HashSet<(u32, u32)> = HashSet::new();
        for idx in g.face_indices.iter().flatten() {
            for k in 0..idx.len() {
                let a = idx[k];
                let b = idx[(k + 1) % idx.len()];
                let key = (a.min(b), a.max(b));
                if seen.insert(key) {
                    for v in [g.vertices[a as usize], g.vertices[b as usize]] {
                        mesh.edges
                            .extend_from_slice(&[v.x as f32, v.y as f32, v.z as f32]);
                        mesh.edge_solids.push(solid_index);
                    }
                }
            }
        }

        for (i, side) in solid.sides.iter().enumerate() {
            let Some(face) = g.faces.get(i).and_then(|f| f.as_ref()) else {
                continue;
            };
            let Some(plane) = side.plane else { continue };
            if has_disp && side.dispinfo.is_none() {
                continue;
            }

            let material = side.material.to_ascii_lowercase();
            let bucket_idx = *by_material.entry(material.clone()).or_insert_with(|| {
                buckets.push((material.clone(), Bucket::new()));
                buckets.len() - 1
            });
            let bucket = &mut buckets[bucket_idx].1;
            let face_id = mesh.face_table.len() as u32;
            let record = FaceRecord {
                solid_index,
                solid_id: solid.id,
                side_id: side.id,
                material: bucket_idx as u32,
            };

            match &side.dispinfo {
                Some(disp) if face.len() == 4 => {
                    if emit_displacement(
                        bucket,
                        side,
                        disp,
                        &face.vertices,
                        face_id,
                        &mut lo,
                        &mut hi,
                    ) {
                        mesh.face_table.push(record);
                        mesh.displacement_faces += 1;
                        mesh.faces += 1;
                    }
                }
                _ => {
                    let base = bucket.vertex_count();
                    for &p in &face.vertices {
                        bucket.push_vertex(p, plane.normal, side, face_id);
                        lo = lo.min(p);
                        hi = hi.max(p);
                    }
                    for k in 1..face.len() as u32 - 1 {
                        bucket
                            .indices
                            .extend_from_slice(&[base, base + k, base + k + 1]);
                    }
                    mesh.face_table.push(record);
                    mesh.faces += 1;
                }
            }
        }
    }

    let mut first_index = 0u32;
    for (mi, (material, b)) in buckets.into_iter().enumerate() {
        let vertex_base = (mesh.positions.len() / 3) as u32;
        mesh.materials.push(material);
        mesh.positions.extend_from_slice(&b.positions);
        mesh.normals.extend_from_slice(&b.normals);
        mesh.texcoords.extend_from_slice(&b.texcoords);
        mesh.alphas.extend_from_slice(&b.alphas);
        mesh.luxels.extend_from_slice(&b.luxels);
        mesh.face_ids.extend_from_slice(&b.face_ids);
        mesh.indices
            .extend(b.indices.iter().map(|i| i + vertex_base));
        let count = b.indices.len() as u32;
        mesh.ranges.push((mi as u32, first_index, count));
        first_index += count;
    }
    if lo.x.is_finite() {
        mesh.bounds = Some((lo, hi));
    }
    mesh
}

/// Emits a displacement surface over a quad face. Returns false when the
/// data does not fit the face (wrong row counts), in which case nothing is
/// emitted.
fn emit_displacement(
    bucket: &mut Bucket,
    side: &Side,
    disp: &DispInfo,
    quad: &[Vec3],
    face_id: u32,
    lo: &mut Vec3,
    hi: &mut Vec3,
) -> bool {
    let n = disp.verts_per_edge();
    if disp.distances.len() != n || disp.distances.iter().any(|r| r.len() != n) {
        return false;
    }
    let has_normals = disp.normals.len() == n && disp.normals.iter().all(|r| r.len() == n);
    let has_offsets = disp.offsets.len() == n && disp.offsets.iter().all(|r| r.len() == n);

    // Rotate the quad so corner 0 is the one nearest startposition; the
    // engine lays rows out from there: corner0 -> corner1 is the row
    // direction, corner0 -> corner3 the column direction.
    let start = (0..4)
        .min_by(|&a, &b| {
            quad[a]
                .distance(disp.start_position)
                .partial_cmp(&quad[b].distance(disp.start_position))
                .unwrap()
        })
        .unwrap_or(0);
    let c: Vec<Vec3> = (0..4).map(|k| quad[(start + k) % 4]).collect();
    let face_normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);

    let base = bucket.vertex_count();
    let mut grid: Vec<Vec3> = Vec::with_capacity(n * n);
    for row in 0..n {
        let t = row as f64 / (n - 1) as f64;
        // Column axis runs c0 -> c1; row axis runs c0 -> c3.
        let row_start = c[0].lerp(c[3], t);
        let row_end = c[1].lerp(c[2], t);
        for col in 0..n {
            let s = col as f64 / (n - 1) as f64;
            let mut p = row_start.lerp(row_end, s);
            let dir = if has_normals {
                disp.normals[row][col]
            } else {
                face_normal
            };
            p += dir * disp.distances[row][col];
            if has_offsets {
                p += disp.offsets[row][col];
            }
            p += face_normal * disp.elevation;
            grid.push(p);
        }
    }

    // Smooth normals from the displaced grid.
    for row in 0..n {
        for col in 0..n {
            let at = |r: isize, cc: isize| -> Vec3 {
                let r = r.clamp(0, n as isize - 1) as usize;
                let cc = cc.clamp(0, n as isize - 1) as usize;
                grid[r * n + cc]
            };
            let (r, cc) = (row as isize, col as isize);
            let du = at(r, cc + 1) - at(r, cc - 1);
            let dv = at(r + 1, cc) - at(r - 1, cc);
            let mut normal = dv.cross(du);
            if normal.length_squared() < 1e-12 || normal.dot(face_normal) < 0.0 {
                normal = -normal;
            }
            if normal.length_squared() < 1e-12 {
                normal = face_normal;
            }
            let p = grid[row * n + col];
            let alpha = disp
                .alphas
                .get(row)
                .and_then(|r| r.get(col))
                .map(|a| (*a as f32 / 255.0).clamp(0.0, 1.0))
                .unwrap_or(0.0);
            bucket.push_vertex_alpha(p, normal.normalize(), side, face_id, alpha);
            *lo = lo.min(p);
            *hi = hi.max(p);
        }
    }

    for row in 0..n - 1 {
        for col in 0..n - 1 {
            let i0 = base + (row * n + col) as u32;
            let i1 = i0 + 1;
            let i2 = i0 + n as u32;
            let i3 = i2 + 1;
            // Alternate the diagonal like the engine does. Rows run along
            // the quad's winding, so counter-clockwise from outside is
            // (corner, next column, next row): the same way plain faces wind.
            if (row + col) % 2 == 0 {
                bucket.indices.extend_from_slice(&[i0, i3, i2, i0, i1, i3]);
            } else {
                bucket.indices.extend_from_slice(&[i0, i1, i2, i1, i3, i2]);
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Map {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../kv/tests/fixtures/hammer_room.vmf"
        );
        Map::parse(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    #[test]
    fn fixture_mesh_has_expected_shape() {
        let map = fixture();
        let mesh = build(&map);
        // Three solids: floor (6 quads), displacement brush (only the disp face), button (6 quads).
        assert_eq!(mesh.solids, 3);
        assert_eq!(mesh.invalid_solids, 0);
        assert_eq!(mesh.displacement_faces, 1);
        assert_eq!(mesh.faces, 13);
        // 12 quads = 24 triangles, plus a power-2 displacement = 4x4 cells x 2 triangles.
        assert_eq!(mesh.indices.len(), (24 + 32) * 3);
        assert_eq!(mesh.positions.len() / 3, 12 * 4 + 25);
        assert_eq!(mesh.normals.len(), mesh.positions.len());
        assert_eq!(mesh.texcoords.len() / 2, mesh.positions.len() / 3);
        assert_eq!(mesh.face_ids.len(), mesh.positions.len() / 3);
        // Materials: dev floor, nodraw, dev wall (disp), dev generic (button).
        assert_eq!(mesh.materials.len(), 4);
        assert!(mesh.materials.contains(&"tools/toolsnodraw".to_string()));
        let total: u32 = mesh.ranges.iter().map(|r| r.2).sum();
        assert_eq!(total as usize, mesh.indices.len());
        for w in mesh.ranges.windows(2) {
            assert_eq!(w[0].1 + w[0].2, w[1].1);
        }
        let (lo, hi) = mesh.bounds.unwrap();
        assert_eq!(lo, Vec3::new(-512.0, -512.0, -128.0));
        assert_eq!(hi.z, 32.0);
    }

    #[test]
    fn face_table_maps_vertices_back_to_solids_and_sides() {
        let mesh = build(&fixture());
        assert_eq!(mesh.face_table.len(), mesh.faces);
        assert_eq!(mesh.solid_ids, vec![2, 20, 61]);
        // Every face id on a vertex is a valid record whose material matches the draw range.
        for (mi, &(material, first, count)) in mesh.ranges.iter().enumerate() {
            assert_eq!(mi as u32, material);
            for i in first..first + count {
                let v = mesh.indices[i as usize] as usize;
                let rec = mesh.face_table[mesh.face_ids[v] as usize];
                assert_eq!(rec.material, material);
                assert_eq!(mesh.solid_ids[rec.solid_index as usize], rec.solid_id);
            }
        }
        // The displacement face belongs to solid 20, side 21.
        let disp = mesh.face_table.iter().find(|r| r.solid_id == 20).unwrap();
        assert_eq!(disp.side_id, 21);
        // The button's six faces.
        assert_eq!(
            mesh.face_table.iter().filter(|r| r.solid_id == 61).count(),
            6
        );
    }

    #[test]
    fn edges_are_unique_per_solid() {
        let mesh = build(&fixture());
        // Three boxes, 12 edges each, two vertices per edge.
        assert_eq!(mesh.edges.len(), 3 * 12 * 2 * 3);
        assert_eq!(mesh.edge_solids.len(), 3 * 12 * 2);
        assert_eq!(mesh.edge_solids.iter().filter(|&&s| s == 1).count(), 24);
    }

    #[test]
    fn displacement_triangles_wind_counter_clockwise_from_outside() {
        let map = fixture();
        let mesh = build(&map);
        // Every displacement triangle's winding normal points with the face normal (+Z here).
        let mut checked = 0;
        for t in mesh.indices.chunks_exact(3) {
            let face = mesh.face_ids[t[0] as usize] as usize;
            let rec = mesh.face_table[face];
            let solid = map.solids().find(|s| s.id == rec.solid_id).unwrap();
            let side = solid.sides.iter().find(|s| s.id == rec.side_id).unwrap();
            if side.dispinfo.is_none() {
                continue;
            }
            let p = |i: u32| {
                let i = i as usize * 3;
                Vec3::new(
                    mesh.positions[i] as f64,
                    mesh.positions[i + 1] as f64,
                    mesh.positions[i + 2] as f64,
                )
            };
            let n = (p(t[1]) - p(t[0])).cross(p(t[2]) - p(t[0]));
            assert!(
                n.dot(side.plane.unwrap().normal) > 0.0,
                "triangle {t:?} winds backwards"
            );
            checked += 1;
        }
        assert_eq!(checked, 32, "power 2: 4×4 quads, two triangles each");
    }

    #[test]
    fn displacement_vertices_are_lifted_by_distances() {
        let map = fixture();
        let mesh = build(&map);
        // The displacement centre has distance 16 along +Z from z = 0.
        let max_z_near_origin = (0..mesh.positions.len() / 3)
            .map(|i| {
                (
                    mesh.positions[i * 3],
                    mesh.positions[i * 3 + 1],
                    mesh.positions[i * 3 + 2],
                )
            })
            .filter(|(x, y, _)| x.abs() < 1.0 && y.abs() < 1.0)
            .map(|(_, _, z)| z)
            .fold(f32::MIN, f32::max);
        assert!(
            (max_z_near_origin - 16.0).abs() < 1e-4,
            "{max_z_near_origin}"
        );
    }

    #[test]
    fn texcoords_follow_texture_axes() {
        let map = fixture();
        let mesh = build(&map);
        // Floor top face: uaxis [1 0 0 0] 0.25 -> texel u = 4x; vertex at x = 512 gives 2048.
        let floor = mesh
            .materials
            .iter()
            .position(|m| m == "dev/dev_measuregeneric01b")
            .unwrap();
        let (_, first, count) = mesh.ranges[floor];
        let mut max_u = f32::MIN;
        for i in first..first + count {
            let v = mesh.indices[i as usize] as usize;
            max_u = max_u.max(mesh.texcoords[v * 2]);
        }
        assert_eq!(max_u, 2048.0);
    }

    #[test]
    fn hidden_solids_are_skipped() {
        let src = "world\n{\n\t\"id\" \"1\"\n\thidden\n\t{\n\t\tsolid\n\t\t{\n\t\t\t\"id\" \"2\"\n\t\t}\n\t}\n}\n";
        let mesh = build(&Map::parse(src).unwrap());
        assert_eq!(mesh.solids, 0);
        assert!(mesh.bounds.is_none());
        assert!(mesh.edges.is_empty());
    }
}
