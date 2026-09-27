import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { coreSpiritSourceMapFromInstructions } from './ir';

/** Conservative IR optimizer. Only folds operations whose operands are compile-time constants. */
export function optimizeCoreSpiritIr(program: CoreSpiritIrProgram): CoreSpiritIrProgram {
  const constants = new Map<string, number|string|boolean|null>();
  const instructions = program.entry.instructions.map((instruction): CoreSpiritIrInstruction => {
    if (instruction.op === 'const') {
      constants.set(instruction.dest, instruction.value);
      return instruction;
    }
    if (instruction.op === 'unary' && constants.has(instruction.operand)) {
      const value = constants.get(instruction.operand)!;
      const folded = foldUnary(instruction.operator, value);
      constants.set(instruction.dest, folded);
      return { op:'const', dest:instruction.dest, value:folded, origin:instruction.origin };
    }
    if (instruction.op === 'binary' && constants.has(instruction.left) && constants.has(instruction.right)) {
      const folded = foldBinary(instruction.operator, constants.get(instruction.left)!, constants.get(instruction.right)!);
      constants.set(instruction.dest, folded);
      return { op:'const', dest:instruction.dest, value:folded, origin:instruction.origin };
    }
    if (instruction.op === 'move' && constants.has(instruction.source)) {
      const value = constants.get(instruction.source)!;
      constants.set(instruction.dest, value);
      return { op:'const', dest:instruction.dest, value, origin:instruction.origin };
    }
    return instruction;
  });
  return { ...program, entry:{ ...program.entry, instructions }, diagnostics:[...program.diagnostics], sourceMap: coreSpiritSourceMapFromInstructions(program.sourceId,instructions) };
}

function foldUnary(operator:'!'|'+'|'-', value:unknown): number|boolean|null {
  if (operator === '!') return !Boolean(value);
  const n = Number(value);
  return Number.isFinite(n) ? (operator === '+' ? n : -n) : null;
}

function foldBinary(operator:string, left:unknown, right:unknown): number|boolean|null {
  if (['+','-','*','/','%','<','<=','>','>='].includes(operator) && (left == null || right == null)) return null;
  const a = Number(left), b = Number(right);
  switch(operator) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    case '%': return a % b;
    case '==': return left === right;
    case '!=': return left !== right;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case 'and': return Boolean(left) && Boolean(right);
    case 'or': return Boolean(left) || Boolean(right);
    default: return null;
  }
}
