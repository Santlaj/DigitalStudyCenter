/**
 * build.js — Copies web assets into www/ for Capacitor
 * Rewrites clean-URL navigations to .html for local file serving
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
      // For JS files, rewrite clean URLs to .html
      if (entry.name.endsWith(".js")) {
        let jsContent = fs.readFileSync(srcPath, "utf-8");
        // Fix navigation links: ./login -> ./login.html, ./student-portal -> ./student-portal.html etc.
        jsContent = jsContent.replace(/(['"])\.\/login(?=['"])/g, "$1./login.html");
        jsContent = jsContent.replace(/(['"])\.\/student-portal(?=['"])/g, "$1./student-portal.html");
        jsContent = jsContent.replace(/(['"])\.\/teacher-portal(?=['"])/g, "$1./teacher-portal.html");
        jsContent = jsContent.replace(/(['"])\/login(?=['"])/g, "$1./login.html");
        jsContent = jsContent.replace(/(['"])\/student-portal(?=['"])/g, "$1./student-portal.html");
        jsContent = jsContent.replace(/(['"])\/teacher-portal(?=['"])/g, "$1./teacher-portal.html");
        fs.writeFileSync(destPath, jsContent, "utf-8");
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

copyDir(path.join(ROOT, "css"), path.join(WWW, "css"));
copyJsDir(path.join(ROOT, "js"), path.join(WWW, "js"));

// 2. Copy HTML files and fix paths for Capacitor local file serving
const htmlFiles = ["login.html", "student-portal.html", "teacher-portal.html"];

for (const file of htmlFiles) {
  const srcFile = path.join(ROOT, file);
  if (!fs.existsSync(srcFile)) {
    console.warn(`  ⚠ Skipping ${file} (not found)`);
    continue;
  }
  let content = fs.readFileSync(srcFile, "utf-8");

  // Remove the clean-URL script that strips .html (breaks Capacitor)
  content = content.replace(/<script>\s*\/\/ Professional Clean URL[\s\S]*?<\/script>\s*/g, "");

  fs.writeFileSync(path.join(WWW, file), content, "utf-8");
  console.log(`  ✓ ${file} copied to www/`);
}

// 3. Write a Capacitor-friendly index.html that redirects to login.html
const indexHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>DigitalStudyCenter</title>
    <script>window.location.replace("login.html");</script>
  </head>
  <body>
    <p>Redirecting to <a href="login.html">login</a>...</p>
  </body>
</html>`;
fs.writeFileSync(path.join(WWW, "index.html"), indexHtml, "utf-8");
console.log("  ✓ index.html (redirect to login.html) created");

console.log("\n✅ www/ directory ready for Capacitor sync.\n");
