const fs = require('fs');
const path = 'src/main.js';
let content = fs.readFileSync(path, 'utf8');

// Target string (missing brace)
const target = "    `).join('');";
// Replacement (brace + newline + join)
const replacement = "    `;\n    }).join('');";

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Patched successfully.");
} else {
  console.log("Target not found.");
  // Debug
  console.log("Searching for:", JSON.stringify(target));
  // Print snippet around line 759
  const lines = content.split('\n');
  if (lines.length > 760) {
    console.log("Line 759:", JSON.stringify(lines[758])); // 0-indexed
  }
}
