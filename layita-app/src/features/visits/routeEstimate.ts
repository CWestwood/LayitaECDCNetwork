export interface Coordinate { latitude: number; longitude: number }
export function straightLineKm(a: Coordinate, b: Coordinate) {
  const rad = (degrees: number) => degrees * Math.PI / 180; const radius = 6371;
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
export function estimateRoute(points: Coordinate[], costPerKm: number) {
  const distanceKm = points.slice(1).reduce((sum, point, index) => sum + straightLineKm(points[index], point), 0);
  return { distanceKm, cost: distanceKm * Math.max(0, costPerKm) };
}
