//! vmf-roundtrip: parse every KeyValues file under a directory with the `kv`
//! crate, write it back, and compare bytes.
//!
//! This is the phase 0 exit criterion: a file saved by Hammer must come back
//! byte-for-byte. The tool is also the regression gate for every later change
//! to the parser.

use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Parser;
use serde::Serialize;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(
    name = "vmf-roundtrip",
    about = "Check that KeyValues files (VMF, VMT, ...) survive parse + write unchanged"
)]
struct Args {
    /// Files or directories to check (directories are walked recursively).
    #[arg(default_value = "testdata/corpus")]
    paths: Vec<PathBuf>,

    /// File extensions to include, comma separated.
    #[arg(long, default_value = "vmf", value_delimiter = ',')]
    ext: Vec<String>,

    /// Write a JSON report to this path.
    #[arg(long)]
    json: Option<PathBuf>,

    /// Print every file, not only the problems.
    #[arg(short, long)]
    verbose: bool,

    /// Treat files that re-parse to the same structure but differ in bytes as success.
    #[arg(long)]
    allow_reformatted: bool,

    /// How many problem files to describe in detail.
    #[arg(long, default_value_t = 10)]
    details: usize,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
enum Status {
    /// Output bytes equal input bytes.
    Identical,
    /// Bytes differ but the output parses to the same structure.
    Reformatted,
    /// Bytes differ and the structure changed or the output no longer parses.
    Corrupted,
    /// The input did not parse.
    ParseError,
    /// The file could not be read.
    ReadError,
}

#[derive(Serialize, Debug)]
struct FileReport {
    path: String,
    status: Status,
    size: u64,
    encoding: &'static str,
    parse_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Serialize, Debug, Default)]
struct Summary {
    files: usize,
    identical: usize,
    reformatted: usize,
    corrupted: usize,
    parse_error: usize,
    read_error: usize,
    bytes: u64,
    parse_ms: f64,
}

fn main() {
    let args = Args::parse();
    let exts: Vec<String> = args.ext.iter().map(|e| e.to_ascii_lowercase()).collect();

    let mut files: Vec<PathBuf> = Vec::new();
    for p in &args.paths {
        if p.is_file() {
            files.push(p.clone());
            continue;
        }
        for entry in WalkDir::new(p)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let ext = entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_ascii_lowercase())
                .unwrap_or_default();
            if exts.contains(&ext) {
                files.push(entry.into_path());
            }
        }
    }
    files.sort();

    if files.is_empty() {
        eprintln!(
            "no files with extension(s) {} under {:?}",
            exts.join(","),
            args.paths
        );
        eprintln!("hint: run `node tools/fetch-corpus.mjs` first");
        std::process::exit(2);
    }

    let mut reports = Vec::with_capacity(files.len());
    let mut summary = Summary::default();

    for path in &files {
        let report = check(path);
        summary.files += 1;
        summary.bytes += report.size;
        summary.parse_ms += report.parse_ms;
        match report.status {
            Status::Identical => summary.identical += 1,
            Status::Reformatted => summary.reformatted += 1,
            Status::Corrupted => summary.corrupted += 1,
            Status::ParseError => summary.parse_error += 1,
            Status::ReadError => summary.read_error += 1,
        }
        if args.verbose || report.status != Status::Identical {
            println!(
                "{:<12} {}",
                format!("{:?}", report.status).to_lowercase(),
                report.path
            );
        }
        reports.push(report);
    }

    let mut problems: Vec<&FileReport> = reports
        .iter()
        .filter(|r| r.status != Status::Identical)
        .filter(|r| !(args.allow_reformatted && r.status == Status::Reformatted))
        .collect();
    problems.sort_by_key(|r| r.status);

    if !problems.is_empty() {
        println!();
        for r in problems.iter().take(args.details) {
            println!("--- {} ({:?})", r.path, r.status);
            if let Some(d) = &r.detail {
                println!("{d}");
            }
        }
        if problems.len() > args.details {
            println!("... and {} more", problems.len() - args.details);
        }
    }

    println!();
    println!(
        "files {}  identical {}  reformatted {}  corrupted {}  parse errors {}  read errors {}",
        summary.files,
        summary.identical,
        summary.reformatted,
        summary.corrupted,
        summary.parse_error,
        summary.read_error
    );
    println!(
        "{:.1} MB parsed in {:.0} ms ({:.1} MB/s)",
        summary.bytes as f64 / 1e6,
        summary.parse_ms,
        if summary.parse_ms > 0.0 {
            summary.bytes as f64 / 1e6 / (summary.parse_ms / 1000.0)
        } else {
            0.0
        }
    );

    if let Some(json) = &args.json {
        #[derive(Serialize)]
        struct Out<'a> {
            summary: &'a Summary,
            files: &'a [FileReport],
        }
        let text = serde_json::to_string_pretty(&Out {
            summary: &summary,
            files: &reports,
        })
        .expect("serialize report");
        if let Err(e) = std::fs::write(json, text) {
            eprintln!("cannot write {}: {e}", json.display());
            std::process::exit(2);
        }
    }

    std::process::exit(if problems.is_empty() { 0 } else { 1 });
}

fn check(path: &Path) -> FileReport {
    let display = path.display().to_string().replace('\\', "/");
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            return FileReport {
                path: display,
                status: Status::ReadError,
                size: 0,
                encoding: "unknown",
                parse_ms: 0.0,
                detail: Some(e.to_string()),
            }
        }
    };
    let size = bytes.len() as u64;
    let (text, encoding) = decode(&bytes);

    let started = Instant::now();
    let doc = match kv::Document::parse(&text) {
        Ok(d) => d,
        Err(e) => {
            return FileReport {
                path: display,
                status: Status::ParseError,
                size,
                encoding,
                parse_ms: ms(started),
                detail: Some(format!("{e}\n{}", context_at_line(&text, e.line))),
            }
        }
    };
    let parse_ms = ms(started);

    let out = doc.to_string();
    let out_bytes = encode(&out, encoding);
    if out_bytes == bytes {
        return FileReport {
            path: display,
            status: Status::Identical,
            size,
            encoding,
            parse_ms,
            detail: None,
        };
    }

    let (status, detail) = match kv::Document::parse(&out) {
        Ok(again) if again.semantic_eq(&doc) => {
            (Status::Reformatted, first_diff(&bytes, &out_bytes))
        }
        Ok(_) => (
            Status::Corrupted,
            format!(
                "structure changed after write\n{}",
                first_diff(&bytes, &out_bytes)
            ),
        ),
        Err(e) => (Status::Corrupted, format!("output does not parse: {e}")),
    };
    FileReport {
        path: display,
        status,
        size,
        encoding,
        parse_ms,
        detail: Some(detail),
    }
}

fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

/// UTF-8 when valid, otherwise Latin-1 (every byte maps to one char), which
/// keeps the byte-for-byte comparison meaningful for legacy code pages.
fn decode(bytes: &[u8]) -> (String, &'static str) {
    match std::str::from_utf8(bytes) {
        Ok(s) => (s.to_string(), "utf8"),
        Err(_) => (bytes.iter().map(|&b| b as char).collect(), "latin1"),
    }
}

fn encode(text: &str, encoding: &str) -> Vec<u8> {
    if encoding == "latin1" {
        text.chars().map(|c| c as u32 as u8).collect()
    } else {
        text.as_bytes().to_vec()
    }
}

fn first_diff(a: &[u8], b: &[u8]) -> String {
    let pos = a
        .iter()
        .zip(b)
        .position(|(x, y)| x != y)
        .unwrap_or(a.len().min(b.len()));
    let line = a[..pos.min(a.len())]
        .iter()
        .filter(|&&c| c == b'\n')
        .count()
        + 1;
    let window = |s: &[u8]| {
        let lo = pos.saturating_sub(30);
        let hi = (pos + 30).min(s.len());
        String::from_utf8_lossy(&s[lo.min(s.len())..hi])
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    };
    format!(
        "first difference at byte {pos} (line {line}); input {} bytes, output {} bytes\n  input:  …{}…\n  output: …{}…",
        a.len(),
        b.len(),
        window(a),
        window(b)
    )
}

fn context_at_line(text: &str, line: usize) -> String {
    let lo = line.saturating_sub(3).max(1);
    text.lines()
        .enumerate()
        .skip(lo - 1)
        .take(5)
        .map(|(i, l)| {
            let marker = if i + 1 == line { ">" } else { " " };
            format!("{marker} {:>5} | {}", i + 1, l.replace('\t', "    "))
        })
        .collect::<Vec<_>>()
        .join("\n")
}
