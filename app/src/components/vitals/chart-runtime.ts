import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export function createVitalsChart(element: HTMLDivElement) {
  return init(element, undefined, { renderer: "canvas" });
}
