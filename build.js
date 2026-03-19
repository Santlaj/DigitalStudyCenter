/**
 * build.js — Copies web assets into www/ for Capacitor
 * Fixes relative paths (../css/, ../js/) to (./css/, ./js/)
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const WWW = path.join(ROOT, "www");

// Clean & create www
if (fs.existsSync(WWW)) fs.rmSync(WWW, { recursive: true });
fs.mkdirSync(WWW, { recursive: true });

// Helper: copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy css/ and js/ folders (excluding server/ and node_modules)
function copyJsDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "server") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyJsDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(path.join(ROOT, "css"), path.join(WWW, "css"));
copyJsDir(path.join(ROOT, "js"), path.join(WWW, "js"));

// 2. Copy HTML files and fix paths
const htmlFiles = ["index.html", "login.html", "student-portal.html", "teacher-portal.html"];

for (const file of htmlFiles) {
  const srcFile = path.join(ROOT, file);
  if (!fs.existsSync(srcFile)) {
    console.warn(`  ⚠ Skipping ${file} (not found)`);
    continue;
  }
  let content = fs.readFileSync(srcFile, "utf-8");
  
  // No need to fix relative paths anymore as they are already ./css/ in the source
  // content = content.replace(/\.\.\/css\//g, "./css/");
  // content = content.replace(/\.\.\/js\//g, "./js/");

  fs.writeFileSync(path.join(WWW, file), content, "utf-8");
  console.log(`  ✓ ${file} copied to www/`);
}

console.log("\n✅ www/ directory ready for Capacitor sync.\n");
