# Developing MCP Provider - Scale Products

This guide covers how to develop and extend the Scale Products MCP Provider.

## Table of Contents

- [Getting Started](#getting-started)
- [Architecture Overview](#architecture-overview)
- [Adding New Antipatterns](#adding-new-antipatterns)
- [Adding New Tools](#adding-new-tools)
- [Testing Guidelines](#testing-guidelines)
- [Code Style](#code-style)

## Getting Started

### Prerequisites

- Node.js 18+ and yarn
- Familiarity with TypeScript and MCP concepts
- Understanding of Apex performance patterns (for antipattern detection)

### Setup

```bash
# From the monorepo root
cd packages/mcp-provider-scale-products

# Install dependencies
yarn install

# Build the package
yarn build

# Run tests
yarn test

# Run tests with coverage
yarn test --coverage
```

## Architecture Overview

The package follows a **SOLID architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Tool Layer                        │
│  (scan-apex-antipatterns-tool.ts)                           │
│  - Reads Apex file                                          │
│  - Orchestrates scanning                                     │
│  - Formats results for LLM                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Antipattern Module Layer                   │
│  (antipattern-module.ts + antipattern-registry.ts)         │
│  - Couples detector with recommender                        │
│  - Manages all registered antipattern modules               │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│    Detector Layer         │   │   Recommender Layer       │
│  (detectors/)             │   │  (recommenders/)          │
│  - Detect antipatterns    │   │  - Generate fix           │
│  - Return metadata        │   │    instructions           │
│  - Assign severity        │   │  - Provide context        │
└───────────────────────────┘   └───────────────────────────┘
```

### Key Principles

1. **Detectors** focus only on detection (what/where/severity)
2. **Recommenders** provide fix instructions for the LLM
3. **LLM** generates the actual code fixes based on instructions
4. **Modules** couple detectors with optional recommenders
5. **Registry** manages all modules in one place

## Adding New Antipatterns

Follow these steps to add a new antipattern detection and recommendation system.

### Step 1: Define the Antipattern Type

Add your new antipattern type to `src/models/antipattern-type.ts`:

```typescript
export enum AntipatternType {
  GGD = "GGD",
  SOQL_IN_LOOP = "SOQL_IN_LOOP",  // ← New antipattern
}
```

### Step 2: Create the Detector

Create a new detector file in `src/detectors/` (e.g., `soql-in-loop-detector.ts`):

```typescript
import { BaseDetector } from "./base-detector.js";
import { DetectedAntipattern } from "../models/detection-result.js";
import { AntipatternType } from "../models/antipattern-type.js";
import { Severity } from "../models/severity.js";

/**
 * Detector for SOQL queries inside loops
 */
export class SoqlInLoopDetector implements BaseDetector {
  // Define regex patterns for detection
  private static readonly SOQL_PATTERN = /\[SELECT\s+.*?\]/i;
  private static readonly LOOP_PATTERNS = [
    /\bfor\s*\(/i,
    /\bwhile\s*\(/i,
  ];

  public getAntipatternType(): AntipatternType {
    return AntipatternType.SOQL_IN_LOOP;
  }

  public detect(className: string, apexCode: string): DetectedAntipattern[] {
    const detections: DetectedAntipattern[] = [];
    const lines = apexCode.split("\n");

    // Your detection logic here
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      if (this.containsSoql(line) && this.isInLoop(lines, lineIndex)) {
        detections.push({
          className,
          methodName: this.extractMethodName(lines, lineIndex),
          lineNumber: lineIndex + 1,
          codeBefore: line.trim(),
          severity: Severity.HIGH,
        });
      }
    }

    return detections;
  }

  private containsSoql(line: string): boolean {
    return SoqlInLoopDetector.SOQL_PATTERN.test(line);
  }

  private isInLoop(lines: string[], lineIndex: number): boolean {
    // Implement loop detection logic
    // ... (similar to GGDDetector.isLineInLoop)
    return false;
  }

  private extractMethodName(lines: string[], lineIndex: number): string | undefined {
    // Implement method name extraction
    // ... (similar to GGDDetector.extractMethodName)
    return undefined;
  }
}
```

**Detector Best Practices:**
- ✅ Return metadata only (no fix suggestions)
- ✅ Use regex for pattern matching
- ✅ Filter out comments and strings (see `GGDDetector.removeComments()`)
- ✅ Assign appropriate severity levels
- ✅ Extract context (method name, line number)
- ✅ Keep detection logic focused and testable

### Step 3: Create Fix Instructions Resource

Create a TypeScript file with the fix instructions in `src/resources/fix-instructions/` (e.g., `soql-in-loop-fix-instructions.ts`):

```typescript
/**
 * Fix instructions for SOQL in loop antipattern
 */
export const SOQL_IN_LOOP_FIX_INSTRUCTIONS = `
# SOQL in Loop Antipattern - Fix Instructions

## Problem
SOQL queries inside loops can hit governor limits. Each query counts against the 100 SOQL query limit per transaction.

## Solution Patterns

### Pattern 1: Collect IDs, then query outside loop
**Before:**
\`\`\`apex
for (Account acc : accounts) {
    Contact c = [SELECT Id, Name FROM Contact WHERE AccountId = :acc.Id LIMIT 1];
    // process contact
}
\`\`\`

**After:**
\`\`\`apex
Set<Id> accountIds = new Set<Id>();
for (Account acc : accounts) {
    accountIds.add(acc.Id);
}

Map<Id, Contact> contactsByAccount = new Map<Id, Contact>();
for (Contact c : [SELECT Id, Name, AccountId FROM Contact WHERE AccountId IN :accountIds]) {
    contactsByAccount.put(c.AccountId, c);
}

for (Account acc : accounts) {
    Contact c = contactsByAccount.get(acc.Id);
    // process contact
}
\`\`\`

### Pattern 2: Use relationship queries
If you're iterating over parent records, use relationship queries instead.

## Important Notes
- Always query outside loops
- Use collections (Set, Map) to organize query results
- Consider using relationship queries for parent-child relationships
\`.trim();
```

**Fix Instructions Best Practices:**
- ✅ Store as exportable TypeScript constant
- ✅ Use markdown formatting for readability
- ✅ Provide clear before/after examples
- ✅ Explain the why (governor limits, performance)
- ✅ Offer multiple solution patterns when applicable
- ✅ Include warnings and edge cases

### Step 4: Create the Recommender

Create a new recommender file in `src/recommenders/` (e.g., `soql-in-loop-recommender.ts`):

```typescript
import { BaseRecommender } from "./base-recommender.js";
import { AntipatternType } from "../models/antipattern-type.js";
import { SOQL_IN_LOOP_FIX_INSTRUCTIONS } from "../resources/fix-instructions/soql-in-loop-fix-instructions.js";

/**
 * Recommender for SOQL in loop antipatterns
 */
export class SoqlInLoopRecommender implements BaseRecommender {
  public getAntipatternType(): AntipatternType {
    return AntipatternType.SOQL_IN_LOOP;
  }

  public getFixInstruction(): string {
    return SOQL_IN_LOOP_FIX_INSTRUCTIONS;
  }
}
```

**Recommender Best Practices:**
- ✅ Import fix instructions from the resources directory
- ✅ Keep recommender class simple and focused
- ✅ No complex logic in the recommender - just return the instructions

### Step 5: Create Tests

Create comprehensive tests in `test/detectors/` and `test/recommenders/`:

```typescript
// test/detectors/soql-in-loop-detector.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SoqlInLoopDetector } from "../../src/detectors/soql-in-loop-detector.js";
import { Severity } from "../../src/models/severity.js";

describe("SoqlInLoopDetector", () => {
  let detector: SoqlInLoopDetector;

  beforeEach(() => {
    detector = new SoqlInLoopDetector();
  });

  it("should detect SOQL in for loop", () => {
    const apexCode = `
public class TestClass {
    public void method() {
        for (Account acc : accounts) {
            Contact c = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
        }
    }
}`;
    const detections = detector.detect("TestClass", apexCode);
    
    expect(detections.length).toBe(1);
    expect(detections[0].severity).toBe(Severity.HIGH);
  });

  it("should not detect SOQL outside loop", () => {
    const apexCode = `
public class TestClass {
    public void method() {
        List<Contact> contacts = [SELECT Id FROM Contact];
    }
}`;
    const detections = detector.detect("TestClass", apexCode);
    expect(detections.length).toBe(0);
  });

  // Add more tests for edge cases
});
```

**Testing Requirements:**
- ✅ Achieve 95%+ code coverage
- ✅ Test positive cases (antipattern detected)
- ✅ Test negative cases (no false positives)
- ✅ Test edge cases (comments, strings, loops, etc.)
- ✅ Test error handling

### Step 6: Register the Antipattern Module

Register your new module in `src/index.ts`:

```typescript
import { SoqlInLoopDetector } from "./detectors/soql-in-loop-detector.js";
import { SoqlInLoopRecommender } from "./recommenders/soql-in-loop-recommender.js";

export class ScaleProductsProvider extends BaseProvider {
  // ...existing code...

  protected getTools(): BaseTool[] {
    const antipatternRegistry = new AntipatternRegistry();
    
    // Existing registrations
    const ggdModule = new AntipatternModule(
      new GGDDetector(),
      new GGDRecommender()
    );
    antipatternRegistry.register(ggdModule);

    // ← Add your new module
    const soqlModule = new AntipatternModule(
      new SoqlInLoopDetector(),
      new SoqlInLoopRecommender()
    );
    antipatternRegistry.register(soqlModule);

    return [
      new ScanApexAntipatternsTool(this.telemetryService, antipatternRegistry)
    ];
  }
}
```

### Step 7: Update Documentation

Update the README.md to document your new antipattern:

```markdown
#### SOQL in Loop
Detects SOQL queries inside loops which can hit governor limits.
- **HIGH**: Any SOQL query inside a loop construct

Provides recommendations to collect IDs and query outside the loop.
```

## Adding New Tools

To add a completely new MCP tool (not an antipattern):

### Step 1: Create the Tool Class

Create a new file in `src/tools/` (e.g., `analyze-limits-tool.ts`):

```typescript
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  McpTool,
  McpToolConfig,
  ReleaseState,
  Toolset,
  TelemetryService,
} from "@salesforce/mcp-provider-api";

// Define input schema
const analyzeLimitsInputSchema = z.object({
  apexFilePath: z
    .string()
    .describe("Absolute path to the Apex class file to analyze"),
});

type InputArgs = z.infer<typeof analyzeLimitsInputSchema>;
type OutputArgs = { analysis: string };

export class AnalyzeLimitsTool extends McpTool<InputArgs, OutputArgs> {
  constructor(private telemetryService: TelemetryService) {
    super();
  }

  public getReleaseState(): ReleaseState {
    return ReleaseState.NON_GA;
  }

  public getToolsets(): Toolset[] {
    return [Toolset.SCALE_PRODUCTS];
  }

  public getName(): string {
    return "analyze_apex_governor_limits";
  }

  public getConfig(): McpToolConfig<InputArgs, OutputArgs> {
    return {
      title: "Analyze Apex Governor Limits",
      description: "Analyzes Apex code for potential governor limit violations",
      inputSchema: analyzeLimitsInputSchema.shape,
      outputSchema: undefined,
      annotations: {
        progressMessage: "Analyzing governor limits...",
      },
    };
  }

  public async exec(input: InputArgs): Promise<CallToolResult> {
    this.telemetryService.sendEvent("analyze_limits_started", {
      filePath: input.apexFilePath,
    });

    try {
      // Your tool logic here
      const analysis = "Analysis results...";

      this.telemetryService.sendEvent("analyze_limits_completed", {
        filePath: input.apexFilePath,
      });

      return {
        content: [
          {
            type: "text",
            text: analysis,
          },
        ],
      };
    } catch (error) {
      this.telemetryService.sendEvent("analyze_limits_error", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
}
```

### Step 2: Register the Tool

Register your tool in `src/index.ts`:

```typescript
protected getTools(): BaseTool[] {
  // ...existing registry setup...

  return [
    new ScanApexAntipatternsTool(this.telemetryService, antipatternRegistry),
    new AnalyzeLimitsTool(this.telemetryService), // ← Add your new tool
  ];
}
```

### Step 3: Create Tests

Create tests in `test/tools/`:

```typescript
import { describe, it, expect } from "vitest";
import { AnalyzeLimitsTool } from "../../src/tools/analyze-limits-tool.js";

describe("AnalyzeLimitsTool", () => {
  it("should have correct tool name", () => {
    const tool = new AnalyzeLimitsTool(telemetryService);
    expect(tool.getName()).toBe("analyze_apex_governor_limits");
  });

  // Add comprehensive tests with 95%+ coverage
});
```

## Testing Guidelines

### Coverage Requirements

- **Minimum 95% coverage** across all metrics (statements, branches, functions, lines)
- All new code must include tests
- Test both success and error paths

### Test Structure

```typescript
describe("ComponentName", () => {
  let instance: ComponentName;

  beforeEach(() => {
    instance = new ComponentName();
  });

  it("should handle normal case", () => {
    // Test implementation
  });

  it("should handle edge case", () => {
    // Test implementation
  });

  it("should handle error case", () => {
    // Test implementation
  });
});
```

### Running Tests

```bash
# Run all tests
yarn test

# Run specific test file
yarn test path/to/test.test.ts

# Run with coverage report
yarn test --coverage

# Watch mode for development
yarn test --watch
```

## Code Style

### General Guidelines

- **TypeScript strict mode**: All code must pass strict type checking
- **ESLint**: Follow the configured ESLint rules
- **Naming conventions**:
  - Classes: `PascalCase`
  - Methods/variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Interfaces: `PascalCase` (no `I` prefix)
  - Files: `kebab-case.ts`

### Documentation

- Add JSDoc comments for all public APIs
- Include `@param` and `@returns` tags
- Explain the "why" not just the "what"

```typescript
/**
 * Detects SOQL queries inside loops which can cause governor limit issues.
 * Scans backwards from detection point to determine if inside loop construct.
 * 
 * @param className - Name of the Apex class being analyzed
 * @param apexCode - The complete Apex class source code
 * @returns Array of detected antipattern instances with metadata
 */
public detect(className: string, apexCode: string): DetectedAntipattern[] {
  // Implementation
}
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add SOQL in loop detector
fix: handle escaped quotes in string detection
test: add edge cases for loop detection
docs: update DEVELOPING.md with new antipattern guide
```

Common types:
- `feat`: New feature
- `fix`: Bug fix
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `chore`: Maintenance tasks

## Additional Resources

- [Main MCP README](../../README.md)
- [MCP Provider API](../mcp-provider-api/README.md)
- [Apex Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
- [Apex Best Practices](https://developer.salesforce.com/wiki/apex_code_best_practices)

## Questions?

For questions or issues:
1. Check existing tests for examples
2. Review the GGD implementation as a reference
3. Reach out to the Scale Products team
