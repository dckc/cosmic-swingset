/** expression evaluator module for use in (xs) compartment
*/
export default function exprValue(expr) {
  return (1, eval)(expr);
}

