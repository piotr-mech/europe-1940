import antiTankUrl from "@/assets/units/anti-tank1.webp?url";
import artilleryUrl from "@/assets/units/artillery1.webp?url";
import soldierUrl from "@/assets/units/soldier1.webp?url";
import tankUrl from "@/assets/units/tank1.webp?url";
import type { UnitTypeId } from "@/types";

/** Unit-type icon (256px webp; plane excluded — aviation is a PRD Non-Goal). */
export const UNIT_ICON: Record<UnitTypeId, string> = {
  infantry: soldierUrl,
  tank: tankUrl,
  artillery: artilleryUrl,
  antiTank: antiTankUrl,
};
