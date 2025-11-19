import { BaseDetector } from "./base-detector.js";
import { DetectedAntipattern } from "../models/detection-result.js";
import { AntipatternType } from "../models/antipattern-type.js";
import { Severity } from "../models/severity.js";
import { SOQLAstUtils, SOQLParser } from "../utils/soql-ast-utils.js";

/**
 * AST-based detector for SOQL queries without WHERE or LIMIT clauses
 * Uses apex-parser for accurate syntax tree analysis
 * 
 * - Checks for missing WHERE or LIMIT clauses
 * - Tracks method context and loop context
 */
export class SOQLNoWhereLimitDetector implements BaseDetector {
  public getAntipatternType(): AntipatternType {
    return AntipatternType.SOQL_NO_WHERE_LIMIT;
  }

  /**
   * Detect SOQL queries lacking WHERE or LIMIT clauses
   * 
   * Process:
   * 1. Extract all SOQL queries using AST (via SOQLAstUtils)
   * 2. For each query, check if it lacks WHERE or LIMIT
   * 3. Report as HIGH severity antipattern
   * 
   * @param className - Name of the Apex class being scanned
   * @param apexCode - Full Apex class source code
   * @returns Array of detected antipatterns
   */
  public detect(className: string, apexCode: string): DetectedAntipattern[] {
    const detections: DetectedAntipattern[] = [];

    try {
      const soqlQueries = SOQLAstUtils.extractSOQLQueries(apexCode);
      
      for (const queryInfo of soqlQueries) {
        if (!queryInfo.hasWhere && !queryInfo.hasLimit) {
          const codeBefore = SOQLParser.formatQueryForDisplay(queryInfo.originalQueryText);

          detections.push({
            className,
            methodName: queryInfo.methodName,
            lineNumber: queryInfo.lineNumber,
            codeBefore,
            severity: Severity.CRITICAL,
          });
        }
      }
    } catch (error) {
      console.error(`Error detecting SOQL antipatterns in ${className}:`, error);
    }

    return detections;
  }
}
