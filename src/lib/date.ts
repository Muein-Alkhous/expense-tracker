// Date helpers built on Day.js, including configurable week-start (see spec 9.15).

import dayjs from "dayjs";

export function today(): string {
  return dayjs().format("YYYY-MM-DD");
}
