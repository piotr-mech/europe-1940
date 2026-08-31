import type { Country } from "@/types";

/** The prototype's two countries (spec §5, §31). */
export const COUNTRIES = [
  {
    id: "germany",
    name: "Niemcy",
    color: "#64748b",
    nationalBonus: {
      id: "blitzkrieg",
      name: "Blitzkrieg",
      description: "Armored units get +1 movement.",
    },
  },
  {
    id: "soviet",
    name: "ZSRR",
    color: "#b91c1c",
    nationalBonus: {
      id: "rezerwy",
      name: "Rezerwy",
      description: "Infantry costs 2 fewer recruits.",
    },
  },
] as const satisfies readonly Country[];
