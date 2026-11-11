/** Percorsi su una griglia: diagonali senza tagliare gli angoli dei mobili. */
export interface Point {
  x: number;
  y: number;
}
export interface Obstacle extends Point {
  w: number;
  h: number;
}
export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const MARGIN = 10;
const CELL = 16;

export function clearSegment(a: Point, b: Point, obstacles: Obstacle[]): boolean {
  return !obstacles.some((o) => {
    const min = [o.x - o.w / 2 - MARGIN, o.y - o.h / 2 - MARGIN];
    const max = [o.x + o.w / 2 + MARGIN, o.y + o.h / 2 + MARGIN];
    const origin = [a.x, a.y],
      direction = [b.x - a.x, b.y - a.y];
    let lo = 0,
      hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      if (Math.abs(direction[axis]) < 1e-8) {
        if (origin[axis] <= min[axis] || origin[axis] >= max[axis]) return false;
      } else {
        const t1 = (min[axis] - origin[axis]) / direction[axis];
        const t2 = (max[axis] - origin[axis]) / direction[axis];
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
        if (lo >= hi) return false;
      }
    }
    return lo < hi;
  });
}

export function npcPath(start: Point, goal: Point, obstacles: Obstacle[], bounds: Bounds): Point[] {
  if (clearSegment(start, goal, obstacles)) return [goal];
  const x0 = bounds.x0 + MARGIN,
    y0 = bounds.y0 + MARGIN;
  const cols = Math.floor((bounds.x1 - MARGIN - x0) / CELL) + 1;
  const rows = Math.floor((bounds.y1 - MARGIN - y0) / CELL) + 1;
  const point = (id: number): Point => ({
    x: x0 + (id % cols) * CELL,
    y: y0 + Math.floor(id / cols) * CELL,
  });
  const free = Array.from({ length: cols * rows }, (_, id) => {
    const p = point(id);
    return clearSegment(p, p, obstacles);
  });
  const nearest = (p: Point): number => {
    const cx = Math.round((p.x - x0) / CELL),
      cy = Math.round((p.y - y0) / CELL);
    let best = -1,
      distance = Infinity;
    for (let y = Math.max(0, cy - 3); y <= Math.min(rows - 1, cy + 3); y++)
      for (let x = Math.max(0, cx - 3); x <= Math.min(cols - 1, cx + 3); x++) {
        const id = y * cols + x,
          q = point(id),
          d = Math.hypot(q.x - p.x, q.y - p.y);
        if (free[id] && d < distance && clearSegment(p, q, obstacles)) {
          best = id;
          distance = d;
        }
      }
    return best;
  };
  const first = nearest(start),
    last = nearest(goal);
  if (first < 0 || last < 0) return [];
  const score = new Float64Array(free.length).fill(Infinity);
  const parent = new Int32Array(free.length).fill(-1);
  const closed = new Uint8Array(free.length);
  const queue: { id: number; priority: number }[] = [];
  const push = (id: number, priority: number): void => {
    queue.push({ id, priority });
    let i = queue.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (queue[p].priority <= priority) break;
      [queue[i], queue[p]] = [queue[p], queue[i]];
      i = p;
    }
  };
  const pop = (): number => {
    const first = queue[0].id,
      tail = queue.pop()!;
    if (queue.length) {
      queue[0] = tail;
      let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= queue.length) break;
        if (child + 1 < queue.length && queue[child + 1].priority < queue[child].priority) child++;
        if (queue[i].priority <= queue[child].priority) break;
        [queue[i], queue[child]] = [queue[child], queue[i]];
        i = child;
      }
    }
    return first;
  };
  score[first] = 0;
  push(first, 0);
  while (queue.length) {
    const id = pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === last) {
      const route: Point[] = [goal];
      for (let at = last; at >= 0; at = parent[at]) route.push(point(at));
      route.reverse();
      // Elimina i punti superflui quando c'è una linea libera verso il prossimo tratto.
      const smooth: Point[] = [];
      let origin = start;
      for (let i = 0; i < route.length; ) {
        let next = i;
        while (next + 1 < route.length && clearSegment(origin, route[next + 1], obstacles)) next++;
        smooth.push(route[next]);
        origin = route[next];
        i = next + 1;
      }
      return smooth;
    }
    const x = id % cols,
      y = Math.floor(id / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= cols || y + dy < 0 || y + dy >= rows) continue;
        const next = (y + dy) * cols + x + dx;
        if (!free[next] || closed[next] || !clearSegment(point(id), point(next), obstacles))
          continue;
        const cost = score[id] + Math.hypot(dx, dy) * CELL;
        if (cost >= score[next]) continue;
        score[next] = cost;
        parent[next] = id;
        const p = point(next),
          target = point(last);
        push(next, cost + Math.hypot(p.x - target.x, p.y - target.y));
      }
  }
  return [];
}
