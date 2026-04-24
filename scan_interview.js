const fs = require('fs');
const src = fs.readFileSync('src/views/student/interview-screen.ejs', 'utf8');
const scriptMatch = src.match(/<script>([\s\S]*?)<\/script>/);
const js = scriptMatch[1];
const jsLines = js.split('\n');

// Careful tokenizer - track brace stack line-by-line
let braces = 0;
let inStr = false, strCh = '', escape = false;
let inLineComment = false, inBlockComment = false;
let peakPositives = []; // lines where braces go positive

for (let i = 0; i < jsLines.length; i++) {
  const line = jsLines[i];
  const prevBraces = braces;
  inLineComment = false;

  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const nx = line[j + 1];

    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === strCh) { inStr = false; }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && nx === '/') { inBlockComment = false; j++; }
      continue;
    }
    if (inLineComment) break;
    if (ch === '/' && nx === '/') { inLineComment = true; break; }
    if (ch === '/' && nx === '*') { inBlockComment = true; j++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue; }
    if (ch === '{') braces++;
    if (ch === '}') braces--;
  }

  // Report lines that increase the delta significantly (unclosed openers near end)
  if (i > jsLines.length - 30 && braces > 0) {
    peakPositives.push({ line: i + 1, braces, text: line.trim().substring(0, 80) });
  }
}

console.log('Final brace count:', braces, braces === 0 ? '(BALANCED)' : '(UNBALANCED - off by ' + braces + ')');

if (braces !== 0) {
  console.log('\nLast 25 JS lines with running brace count:');
  // Re-run just last 30 lines
  let b2 = 0, inS2 = false, sC2 = '', es2 = false, lc2 = false, bc2 = false;
  // First get to the right count up to last 30 lines
  for (let i = 0; i < jsLines.length - 25; i++) {
    const line = jsLines[i];
    lc2 = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j], nx = line[j+1];
      if (es2) { es2=false; continue; }
      if (inS2) { if(ch==='\\'){es2=true;continue;} if(ch===sC2)inS2=false; continue; }
      if (bc2) { if(ch==='*'&&nx==='/')bc2=false; continue; }
      if (lc2) break;
      if(ch==='/'&&nx=='/'){lc2=true;break;}
      if(ch==='/'&&nx==='*'){bc2=true;continue;}
      if(ch==='"'||ch==="'"||ch==='`'){inS2=true;sC2=ch;continue;}
      if(ch==='{')b2++;
      if(ch==='}')b2--;
    }
  }

  for (let i = Math.max(0, jsLines.length - 25); i < jsLines.length; i++) {
    const line = jsLines[i];
    lc2 = false;
    const prevB = b2;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j], nx = line[j+1];
      if (es2) { es2=false; continue; }
      if (inS2) { if(ch==='\\'){es2=true;continue;} if(ch===sC2)inS2=false; continue; }
      if (bc2) { if(ch==='*'&&nx==='/')bc2=false; continue; }
      if (lc2) break;
      if(ch==='/'&&nx=='/'){lc2=true;break;}
      if(ch==='/'&&nx==='*'){bc2=true;continue;}
      if(ch==='"'||ch==="'"||ch==='`'){inS2=true;sC2=ch;continue;}
      if(ch==='{')b2++;
      if(ch==='}')b2--;
    }
    const marker = (prevB !== b2) ? ' <<< CHANGED' : '';
    console.log('  JS L' + (i+1) + ' [braces=' + b2 + ']' + marker + ' | ' + line.trim().substring(0, 70));
  }
}

// Also check paren balance independently
let parens = 0;
inStr = false; strCh = ''; escape = false; inLineComment = false; inBlockComment = false;
for (let i = 0; i < jsLines.length; i++) {
  const line = jsLines[i];
  inLineComment = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j], nx = line[j+1];
    if (escape) { escape=false; continue; }
    if (inStr) { if(ch==='\\'){escape=true;continue;} if(ch===strCh)inStr=false; continue; }
    if (inBlockComment) { if(ch==='*'&&nx==='/')inBlockComment=false; continue; }
    if (inLineComment) break;
    if(ch==='/'&&nx=='/'){inLineComment=true;break;}
    if(ch==='/'&&nx==='*'){inBlockComment=true;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){inStr=true;strCh=ch;continue;}
    if(ch==='(')parens++;
    if(ch===')')parens--;
  }
}
console.log('Final paren count:', parens, parens === 0 ? '(BALANCED)' : '(UNBALANCED - off by ' + parens + ')');
