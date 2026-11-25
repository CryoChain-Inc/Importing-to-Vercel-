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
  /** The driver's name; its first letter is shown as an avatar on the truck. */
  truckName?: string;
  places?: LivePlace[];
  /** The road ahead. */
  route?: LatLng[];
  /** The road already driven. */
  trail?: LatLng[];
  height?: number;
}
