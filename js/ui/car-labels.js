import * as THREE from 'three';

const SVG = 'http://www.w3.org/2000/svg';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Spread a compact pack's labels into nearby rows, retaining a connector per car. */
export function layoutCarLabels(anchors, width, height) {
  const labelWidth = Math.min(132, width - 16), labelHeight = 25;
  const occupied = [];
  return anchors.map((anchor) => {
    let best = null;
    // Use common rows so nearby anchors cannot produce one-pixel overlaps.
    // Search below as well as above when a pack is near the viewport's top.
    const rows = Math.max(1, Math.floor((height - labelHeight - 12 - 55) / 33) + 1);
    for (let row = 0; row < rows; row++) for (const dx of [0, -70, 70, -140, 140, -210, 210]) {
      const x = clamp(anchor.x + dx - labelWidth / 2, 5, width - labelWidth - 5);
      const y = 55 + row * 33;
      let overlap = 0;
      for (const rect of occupied) overlap += Math.max(0, Math.min(x + labelWidth + 3, rect.x + labelWidth + 3) - Math.max(x - 3, rect.x - 3))
        * Math.max(0, Math.min(y + labelHeight + 3, rect.y + labelHeight + 3) - Math.max(y - 3, rect.y - 3));
      const cost = overlap * 1000 + (x + labelWidth / 2 - anchor.x) ** 2 * 0.1 + (y + labelHeight + 22 - anchor.y) ** 2 * 0.04;
      if (!best || cost < best.cost) best = { ...anchor, x, y, width: labelWidth, height: labelHeight, cost };
    }
    occupied.push(best);
    return best;
  });
}

/** Crisp HTML nameplates projected from the same interpolated poses as the cars. */
export function createCarLabels(viewport) {
  const layer = document.createElement('div');
  layer.className = 'car-label-layer';
  // The live standings already provide the accessible equivalent without duplicate
  // per-frame announcements or an extra interactive surface over the canvas.
  layer.setAttribute('aria-hidden', 'true');
  const connectors = document.createElementNS(SVG, 'svg');
  connectors.classList.add('car-label-connectors');
  layer.append(connectors);
  viewport.append(layer);
  const labels = new Map();
  const projected = new THREE.Vector3();

  function ensure(entry) {
    if (labels.has(entry.id)) return labels.get(entry.id);
    const node = document.createElement('div');
    node.className = 'car-label'; node.dataset.racerId = entry.id;
    const rank = document.createElement('span'); rank.className = 'car-label-rank';
    const name = document.createElement('span'); name.className = 'car-label-name';
    // Keep the arrow at the real projected car position even if the name moves
    // sideways to make a bunched pack readable. A thin leader connects the two.
    const arrow = document.createElement('span'); arrow.className = 'car-label-arrow';
    arrow.textContent = '▼'; arrow.dataset.racerId = entry.id;
    const line = document.createElementNS(SVG, 'line');
    const you = document.createElement('span'); you.className = 'car-label-you'; you.textContent = 'YOU'; you.hidden = true;
    node.append(rank, name, you); layer.append(node, arrow); connectors.append(line);
    const label = { node, rank, name, you, line, arrow };
    labels.set(entry.id, label);
    return label;
  }

  return {
    update(targets, standings, camera, visible = true, localPlayerId = null) {
      layer.hidden = !visible;
      if (!visible) return;
      const { width, height } = viewport.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      connectors.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const ranks = new Map(standings.map((row) => [row.id, row]));
      const active = new Set();
      const anchors = [];
      camera.updateMatrixWorld();
      targets.forEach(({ entry, root }, index) => {
        active.add(entry.id);
        const label = ensure(entry);
        const standing = ranks.get(entry.id);
        const rank = standing?.status === 'dnf' ? 'DNF' : `P${standing?.position || index + 1}`;
        if (label.rank.textContent !== rank) label.rank.textContent = rank;
        if (label.name.textContent !== entry.name) label.name.textContent = entry.name;
        label.node.style.setProperty('--car-paint', entry.color);
        label.arrow.style.setProperty('--car-paint', entry.color);
        label.node.dataset.status = standing?.status || 'grid';
        const isSelf = localPlayerId ? (entry.id === localPlayerId) : !entry.isBot;
        label.node.dataset.local = String(isSelf);
        label.node.dataset.self = String(isSelf);
        label.arrow.dataset.self = String(isSelf);
        if (label.you) label.you.hidden = !isSelf;
        label.line.setAttribute('stroke', entry.color);
        root.getWorldPosition(projected);
        projected.y += 2.1;
        projected.project(camera);
        const onScreen = Number.isFinite(projected.x) && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1.03 && Math.abs(projected.y) < 1.03;
        label.node.hidden = !onScreen;
        label.arrow.hidden = !onScreen;
        label.line.style.display = onScreen ? '' : 'none';
        if (onScreen) anchors.push({ id: entry.id, x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height });
      });
      for (const [id, label] of labels) if (!active.has(id)) {
        label.node.remove(); label.line.remove(); label.arrow.remove(); labels.delete(id);
      }
      for (const placement of layoutCarLabels(anchors, width, height)) {
        const label = labels.get(placement.id);
        const anchor = anchors.find((point) => point.id === placement.id);
        label.node.style.width = `${placement.width}px`;
        label.node.style.transform = `translate(${placement.x.toFixed(1)}px, ${placement.y.toFixed(1)}px)`;
        label.arrow.style.transform = `translate(${(anchor.x - 8).toFixed(1)}px, ${(anchor.y - 16).toFixed(1)}px)`;
        label.line.setAttribute('x1', String(placement.x + placement.width / 2));
        label.line.setAttribute('y1', String(placement.y + placement.height));
        label.line.setAttribute('x2', String(anchor.x));
        label.line.setAttribute('y2', String(anchor.y - 16));
      }
    },
    dispose() { labels.clear(); layer.remove(); },
  };
}
