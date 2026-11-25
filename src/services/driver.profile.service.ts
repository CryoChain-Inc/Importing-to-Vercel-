import { EXT, readBytes, type PickedImage } from './catalogueImage';
import { produceImageUrl } from './farmer.service';
import { requireUserId, supabase } from './supabase';

export interface DriverProfile {
  vehicleType: string;
  plate: string;
  licence: string;
  photoPath: string | null;
  photoUrl: string | null;
  /** Fleet truck assigned by operations, if any. */
  truckName: string;
  truckPlate: string;
  capacityKg: number | null;
}

/** The driver's own details. Everything but the photo is set by operations, so it is read-only here. */
export async function fetchDriverProfile(): Promise<DriverProfile> {
  const id = await requireUserId();
  const [driver, truck] = await Promise.all([
    supabase
      .from('drivers')
      .select('vehicle_type, plate_number, licence_number, photo_path')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('trucks').select('name, plate, capacity_kg').eq('driver_id', id).maybeSingle(),
  ]);
  if (driver.error) throw new Error('Could not load your details.');
  const d = driver.data;
  const t = truck.data;
  return {
    vehicleType: d?.vehicle_type ?? '',
    plate: d?.plate_number ?? '',
    licence: d?.licence_number ?? '',
    photoPath: d?.photo_path ?? null,
    photoUrl: d?.photo_path ? produceImageUrl(d.photo_path, 240) : null,
    truckName: t?.name ?? '',
    truckPlate: t?.plate ?? '',
    capacityKg: t?.capacity_kg == null ? null : Number(t.capacity_kg),
  };
}

/** Sets (or clears, with null) the profile photo and removes the old file. */
export async function saveDriverPhoto(img: PickedImage | null, oldPath: string | null) {
  const id = await requireUserId();
  const bucket = supabase.storage.from('produce');
  let path: string | null = null;
  if (img) {
    const type = img.mimeType ?? 'image/jpeg';
    if (!EXT[type]) throw new Error('Use a JPEG, PNG or WebP image.');
    const body = await readBytes(img.uri);
    if (body.byteLength === 0) throw new Error('The photo could not be read. Pick it again.');
    path = `${id}/profile-${Date.now()}.${EXT[type]}`;
    if ((await bucket.upload(path, body, { contentType: type })).error)
      throw new Error('Could not upload the photo (max 2 MB).');
  }
  const { error } = await supabase.from('drivers').update({ photo_path: path }).eq('id', id);
  if (error) {
    if (path) await bucket.remove([path]);
    throw new Error('Could not save your photo.');
  }
  if (oldPath) await bucket.remove([oldPath]).catch(() => undefined);
}
