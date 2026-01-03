
export interface Location {
  lat: number;
  lng: number;
}

export interface BusinessPoint {
  id: string;
  name: string;
  type: 'bar' | 'salon' | 'rental' | 'generic' | 'district';
  lat: number;
  lng: number;
  address?: string;
  status?: 'pending' | 'success' | 'failure';
}

export interface District {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  covered: boolean;
  population?: string;
}

export interface TrackingPath {
  timestamp: number;
  location: Location;
}

export interface RouteHistory {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  distanceKm: number;
  path: Location[];
}
