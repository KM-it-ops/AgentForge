# gemini-cli duplicate require broke verify

**Date:** 2026-06-21  
**Area:** adapters/gemini-cli

## Problem

`npm run verify` failed on gemini-cli round-trip:

```
SyntaxError: Identifier 'buildMcpRitualBlock' has already been declared
```

## Root cause

`adapters/gemini-cli/emit.js` imported `render-mcp-ritual.js` twice (lines 36 and 38).

## Fix

Delete the duplicate `require` line.

## Proof

```powershell
$env:PATH='C:\Program Files\nodejs;' + $env:PATH
npm run verify
```

Exit 0.

## Files

- `adapters/gemini-cli/emit.js`
