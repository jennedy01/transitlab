/** Honours the user's reduced-motion preference for map camera animations. */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Animation duration in ms, collapsed to 0 when reduced motion is requested. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}
