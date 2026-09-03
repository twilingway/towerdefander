import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BarChart } from "./BarChart.js";
import { toneForShare } from "./scale.js";

const reach = {
  categories: ["1", "2", "3"],
  series: [{ label: "дошли, %", points: [100, 55, 25] }]
};

describe("BarChart", () => {
  it("draws a bar per category and prints the value on it", () => {
    const markup = renderToStaticMarkup(
      <BarChart title="Доля прогонов" unit="%" tone={toneForShare} showValues data={reach} />
    );
    expect(markup.match(/<rect/g)).toHaveLength(3);
    expect(markup.match(/chart__value/g)).toHaveLength(3);
    expect(markup).toContain("100%");
  });

  it("colours each bar by its own value when a tone is given", () => {
    const markup = renderToStaticMarkup(
      <BarChart title="Доля прогонов" unit="%" tone={toneForShare} showValues data={reach} />
    );
    expect(markup).toContain("chart__mark--good");
    expect(markup).toContain("chart__mark--warn");
    expect(markup).toContain("chart__mark--bad");
    // A legend of one grey series says nothing once the bars carry the meaning.
    expect(markup).not.toContain("chart__legend");
  });

  it("keeps the series legend and colours when no tone is given", () => {
    const markup = renderToStaticMarkup(<BarChart title="Волна" data={reach} />);
    expect(markup).toContain("chart__legend");
    expect(markup).toContain("chart__mark--a");
    expect(markup).not.toContain("chart__mark--good");
  });
});
