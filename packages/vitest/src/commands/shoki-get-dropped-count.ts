import type {
  ShokiGetDroppedCountArgs,
  ShokiGetDroppedCountResult,
} from '../command-types.js';

export function createShokiGetDroppedCountHandler() {
  return async (
    _ctx: unknown,
    args: ShokiGetDroppedCountArgs,
  ): Promise<ShokiGetDroppedCountResult> => {
    void args;
    return { droppedCount: 0 };
  };
}
