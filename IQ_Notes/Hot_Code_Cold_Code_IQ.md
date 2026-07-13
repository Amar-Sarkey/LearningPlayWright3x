# Hot Code vs Cold Code (JIT Compilation)

## Example Source Code

```javascript
function add(a, b) {
  return a + b;
}

// Cold call — first invocation
console.log(add(5, 3));

// Hot call — invoked thousands of times in a loop
for (let i = 0; i < 100000; i++) {
  add(i, i + 1);
}
```

This is our source file: `02_HotCold.js`

---

## Comparison Table

| Aspect | Cold Code | Hot Code |
|--------|-----------|----------|
| **Definition** | Code that runs infrequently or has just been parsed | Code that runs many times (crosses a "hotness" threshold) |
| **Execution engine** | **Ignition Interpreter** — runs byte code directly | **TurboFan JIT Compiler** — compiles byte code to native machine code |
| **Speed** | **Slow** — each instruction is decoded and dispatched at runtime | **Fast** — compiled to raw CPU instructions, cached and reused |
| **Optimization level** | None / minimal — no type assumptions, no inlining | Aggressive — type specialization, inlining, loop unrolling, dead code elimination |
| **When does it trigger?** | From the start — as soon as the VM parses the source | After a threshold (typically ~1,000–10,000 executions of the same function) |
| **Memory usage** | Low — byte code is compact | Higher — native machine code takes more space, plus optimization metadata |
| **Profiling data** | None collected yet | VM collects type feedback, call counts, and branch info to guide optimization |
| **De-optimization risk** | None — interpreter always works correctly | **Can de-opt** — if an optimization assumption breaks (e.g., unexpected type), V8 falls back to byte code |
| **Analogy** | Reading a recipe line-by-line from a cookbook and following each step | Memorizing the recipe after cooking it many times — you just do it without looking |
| **Startup impact** | Dominates startup time (cold start) | Irrelevant at startup — only matters for long-running code |

---

## How They Relate (Using Our Example)

### 1. First Call — Cold (Ignition Interpreter)

When `add(5, 3)` runs for the **first time**, V8 hasn't seen this function before. Ignition interprets the byte code directly:

```
;; Simplified V8 Ignition byte code (cold path)
Ldar       a1            ; Load argument b into accumulator
Add        a0            ; Add argument a to accumulator
Return                   ; Return the result
```

- The interpreter **decodes** each instruction, **looks up** what to do, then **executes** it
- No type assumptions — it works for **any** input types (numbers, strings, objects that override `valueOf`)
- No optimization overhead — just gets the job done correctly
- **Result**: `8` is printed, but the function took longer per execution than it will later

### 2. Loop Calls — Warming Up (Ignition + Profiling)

```javascript
for (let i = 0; i < 100000; i++) {
  add(i, i + 1);
}
```

Each iteration calls `add` again. V8's profiler counts the calls and records **type feedback**:

```
;; After a few thousand calls, V8 has profiling data:
;;   - a is always an integer (Smi — Small integer)
;;   - b is always an integer (Smi)
;;   - The + operation always produces an integer
```

After ~1,000–10,000 calls, V8 flags `add` as **hot** and schedules it for compilation.

### 3. Optimized Call — Hot (TurboFan JIT)

TurboFan takes the profiling data and generates **highly optimized native machine code** tailored for integers:

```asm
;; TurboFan-optimized x86-64 (hot path — integer addition only)
mov    eax, dword [rdi + 0x8]     ; Load arg a (guaranteed Smi)
add    eax, dword [rsi + 0x8]     ; Add arg b (guaranteed Smi)
ret                                ; Return (result is a Smi-integer)
```

**What TurboFan assumed to optimize:**
- Both arguments are always **small integers** → uses cheap `add` instruction, no boxing/unboxing
- No side effects → no guard checks needed
- Return type is also integer → no conversion overhead

**What happens if an assumption breaks (de-optimization):**

```javascript
add("hello", "world");  // Oops — passed strings!
```

TurboFan's optimized code has a **type guard** that checks the assumptions at runtime:

```
;; Type guard inserted by TurboFan
test   rdi, 0x1           ; Check if arg a is a Smi (low bit = 0)
jnz    deoptimize         ; If not, bail out to interpreted byte code
```

When the guard fails, V8 **de-optimizes** `add` — discards the machine code, reverts to Ignition byte code, and re-profiles the new type pattern.

---

## Execution Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Source Code (.js)                                              │
│   function add(a, b) { return a + b; }                          │
│         │                                                        │
│         ▼                                                        │
│   ├── Parser ──► AST ──► Ignition (Byte Code Generator)         │
│         │                                                        │
│         ▼                                                        │
│   ┌────────────────────────────────────────────────────────┐     │
│   │                COLD PATH (Ignition)                    │     │
│   │                                                        │     │
│   │   Byte Code — interpreted instruction-by-instruction   │     │
│   │   No optimizations — works with any types              │     │
│   │   Profiler collects: call count + type feedback        │     │
│   └───────────────────────┬────────────────────────────────┘     │
│                           │                                      │
│               Call count < threshold                             │
│               (still cold)                                       │
│                           │                                      │
│               Call count >= threshold                            │
│               (becomes HOT — TurboFan triggered)                 │
│                           │                                      │
│                           ▼                                      │
│   ┌────────────────────────────────────────────────────────┐     │
│   │                HOT PATH (TurboFan JIT)                 │     │
│   │                                                        │     │
│   │   Compiles byte code → optimized native machine code   │     │
│   │   Assumes types from profiling (e.g., Smi + Smi)       │     │
│   │   Inserted type guards (checks before optimized code)  │     │
│   │   Cached — reused for all subsequent "compatible" calls│     │
│   └──────┬──────────────────────────────────────┬──────────┘     │
│          │                                      │                 │
│          ▼                                      ▼                 │
│   Type checks pass                       Type checks fail        │
│   (expected types)                (unexpected types — de-opt)    │
│          │                                      │                 │
│          ▼                                      ▼                 │
│   CPU executes                          Back to Ignition         │
│   native code                          (re-profile, retry JIT)  │
│   (fastest)                              (slow but correct)      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Takeaways

| Code Type | Trigger | Speed | Type Flexibility | Optimizer Used | Example Call Count |
|-----------|---------|-------|-----------------|----------------|-------------------|
| **Cold** | First ~1,000 calls | 🐢 Slow (interpreted) | ✅ Any types welcome | Ignition | `add(5, 3)` — 1 call |
| **Warm** | Warming up (profiling) | 🐇 Getting faster | ✅ Type feedback collected | Ignition + Profiler | `add(i, i+1)` — calls 1–999 |
| **Hot** | Crosses threshold | 🚀 Fastest (native) | ⚠️ Only optimized types (de-opt on miss) | TurboFan | `add(i, i+1)` — calls 1,000+ |
| **De-opted** | Assumption broken | 🐢 Falls back to cold | ✅ Any types again | Ignition (re-profile) | After `add("hello", "world")` |

### Why JIT Engines Use This Hot/Cold Strategy

- **Fast startup**: Cold code starts executing immediately via the interpreter — no waiting for a full compilation
- **Self-tuning**: Only the "hot" functions that actually matter get the expensive optimization treatment
- **Speculative optimization**: By assuming common types (e.g., always integers), TurboFan generates code 10–100x faster than the interpreter
- **Safety net**: De-optimization guarantees correctness — the interpreter always has a fallback path
