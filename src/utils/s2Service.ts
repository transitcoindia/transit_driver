import axios from 'axios';

const S2_SERVICE_URL = 'http://localhost:5001';

export async function getCellId(lat: number, lng: number, level = 15) {
  const res = await axios.post(`${S2_SERVICE_URL}/cellid`, { lat, lng, level });
  return res.data.cell_id;
}

export async function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const res = await axios.post(`${S2_SERVICE_URL}/distance`, { lat1, lng1, lat2, lng2 });
  return res.data.distance_meters;
}

export async function getNeighbors(cell_id: string, level = 15) {
  const res = await axios.post(`${S2_SERVICE_URL}/neighbors`, { cell_id, level });
  return res.data.neighbors;
}

export async function isPointInRegion(lat: number, lng: number, region: Array<{lat: number, lng: number}>) {
  const res = await axios.post(`${S2_SERVICE_URL}/point_in_region`, { lat, lng, region });
  return res.data.inside;
} 