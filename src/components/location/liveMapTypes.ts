export interface LatLng {
  lat: number;
  lng: number;
}

export interface LivePlace extends LatLng {
  label: string;
  /** pickup and dropoff are still to come; done is already visited. */
  kind: 'pickup' | 'dropoff' | 'done';
}

export interface LiveMapProps {
  truck?: LatLng | null;
  places?: LivePlace[];
  /** The road ahead. */
  route?: LatLng[];
  /** The road already driven. */
  trail?: LatLng[];
  height?: number;
}
