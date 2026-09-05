/**
 * Rotate rooms only for newly seen floors; preserve assignments across reordering
 * and relaunches. Demo choices never consume a real project's room rotation.
 * @param {Record<string,string>} previous
 * @param {string[]} floorIds
 * @param {string[]} roomIds
 * @returns {Record<string,string>}
 */
export function assignLayouts(previous, floorIds, roomIds) {
  let result = previous;
  for (const id of floorIds) {
    if (roomIds.includes(result[id])) continue;
    if (result === previous) result = { ...previous };
    const demo = id.startsWith('demo-');
    const count = Object.keys(result).filter(
      (k) => k.startsWith('demo-') === demo && roomIds.includes(result[k]),
    ).length;
    result[id] = roomIds[count % roomIds.length];
  }
  return result;
}
