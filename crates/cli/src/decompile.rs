//! `bsp-decompile`: a compiled map back to VMF text, with a report of what
//! could not be restored.

use std::path::PathBuf;

use clap::Parser;

#[derive(Parser)]
#[command(
    about = "Decompiles a Source BSP to a VMF (brushes, entities, displacements, static props)"
)]
struct Args {
    /// The compiled map.
    bsp: PathBuf,
    /// Where to write the VMF; `<name>_d.vmf` next to the BSP when omitted.
    out: Option<PathBuf>,
}

fn main() {
    let args = Args::parse();
    let data = match std::fs::read(&args.bsp) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("{}: {e}", args.bsp.display());
            std::process::exit(2);
        }
    };
    let started = std::time::Instant::now();
    let bsp = match bsp::Bsp::parse(data) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    let result = match bsp::decompile(&bsp) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    let out = args.out.unwrap_or_else(|| {
        let stem = args
            .bsp
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        args.bsp.with_file_name(format!("{stem}_d.vmf"))
    });
    if let Err(e) = std::fs::write(&out, &result.vmf) {
        eprintln!("{}: {e}", out.display());
        std::process::exit(2);
    }
    let r = &result.report;
    println!(
        "{} (VBSP {}, revision {}): world brushes {}, detail {}, entity brushes {}, sides {}, entities {}, static props {}, displacements {}, cubemaps {}, skipped brushes {}; {:.0} ms",
        args.bsp.display(),
        bsp.version,
        bsp.map_revision,
        r.world_brushes,
        r.detail_brushes,
        r.entity_brushes,
        r.sides,
        r.entities,
        r.static_props,
        r.displacements,
        r.cubemaps,
        r.skipped_brushes,
        started.elapsed().as_secs_f64() * 1000.0
    );
    for line in &r.lost {
        println!("  lost: {line}");
    }
    let classes = bsp::class_counts(&result.vmf);
    let mut top: Vec<_> = classes.iter().collect();
    top.sort_by(|a, b| b.1.cmp(a.1));
    println!(
        "  classes: {}",
        top.iter()
            .take(12)
            .map(|(k, n)| format!("{k} {n}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!("  wrote {} ({} bytes)", out.display(), result.vmf.len());
}
