//! `vmf-memory`: how much heap a parsed VMF takes at each layer, measured
//! with a counting allocator. The wasm core keeps the same structures, so
//! this is the cheapest way to see what fills its linear memory.

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

struct Counting;

static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
static COUNT: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let p = System.alloc(layout);
        if !p.is_null() {
            let live = LIVE.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
            PEAK.fetch_max(live, Ordering::Relaxed);
            COUNT.fetch_add(1, Ordering::Relaxed);
        }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, layout: Layout) {
        LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
        System.dealloc(p, layout)
    }
}

#[global_allocator]
static A: Counting = Counting;

fn mb(b: usize) -> f64 {
    b as f64 / 1048576.0
}

fn report(stage: &str, before: usize, count_before: usize) {
    let live = LIVE.load(Ordering::Relaxed);
    println!(
        "{stage:<28} live {:>8.1} MB  (+{:>7.1} MB, {} allocations), peak {:.1} MB",
        mb(live),
        mb(live.saturating_sub(before)),
        COUNT.load(Ordering::Relaxed) - count_before,
        mb(PEAK.load(Ordering::Relaxed))
    );
}

fn count_nodes(nodes: &[kv::Node]) -> (usize, usize) {
    let mut pairs = 0;
    let mut blocks = 0;
    for n in nodes {
        match n {
            kv::Node::Pair(_) => pairs += 1,
            kv::Node::Block(b) => {
                blocks += 1;
                let (p, bl) = count_nodes(&b.children);
                pairs += p;
                blocks += bl;
            }
        }
    }
    (pairs, blocks)
}

fn main() {
    let path = std::env::args().nth(1).expect("vmf-memory <file.vmf>");
    let base = LIVE.load(Ordering::Relaxed);
    let text = std::fs::read_to_string(&path).expect("read");
    report("file text", base, 0);
    let c0 = COUNT.load(Ordering::Relaxed);
    let l0 = LIVE.load(Ordering::Relaxed);
    let kvdoc = kv::Document::parse(&text).expect("kv parse");
    report("kv tree (lossless)", l0, c0);
    let (pairs, blocks) = count_nodes(&kvdoc.nodes);
    println!(
        "  {pairs} pairs, {blocks} blocks, {} bytes per pair on average",
        (LIVE.load(Ordering::Relaxed) - l0) / pairs.max(1)
    );
    drop(kvdoc);
    let c1 = COUNT.load(Ordering::Relaxed);
    let l1 = LIVE.load(Ordering::Relaxed);
    let map = vmf::Map::parse(&text).expect("vmf parse");
    report("vmf::Map (kv + typed)", l1, c1);
    let c2 = COUNT.load(Ordering::Relaxed);
    let l2 = LIVE.load(Ordering::Relaxed);
    let mut faces = 0usize;
    let mut verts = 0usize;
    let mut geoms = Vec::new();
    for s in map.solids() {
        let g = s.geometry();
        faces += g.faces.iter().filter(|f| f.is_some()).count();
        verts += g.vertices.len();
        geoms.push(g);
    }
    report("geometry of every solid", l2, c2);
    println!("  {faces} faces, {verts} welded vertices");
    drop(geoms);
    drop(map);
    drop(text);
    report("after dropping all", base, 0);
}
