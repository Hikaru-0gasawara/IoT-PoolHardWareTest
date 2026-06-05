import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Header } from "@/components/AppShell";

let mockPathname = "/";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, ...props }: any) => (
    <a {...props} href={props.to ?? "#"}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mockPathname = "/";
});
afterEach(cleanup);

describe("Header — estado de rota ativa no menu horizontal", () => {
  const ACTIVE = ["bg-aqua-surface-2", "text-aqua-text"];
  const INACTIVE = ["text-aqua-text-muted"];

  const navLink = (label: string) => {
    const links = screen.getAllByRole("link");
    return links.find((l) => l.textContent === label && l.closest("nav"))!;
  };

  const items = [
    { to: "/", label: "Visão Geral" },
    { to: "/graficos", label: "Gráficos" },
    { to: "/alertas", label: "Alertas" },
    { to: "/config", label: "Configurações" },
  ] as const;

  for (const current of items) {
    it(`em ${current.to} só "${current.label}" recebe as classes ativas`, () => {
      mockPathname = current.to;
      render(<Header />);

      for (const item of items) {
        const link = navLink(item.label);
        if (item.to === current.to) {
          for (const c of ACTIVE) expect(link.className).toContain(c);
        } else {
          for (const c of INACTIVE) expect(link.className).toContain(c);
          expect(link.className).not.toContain("bg-aqua-surface-2");
        }
      }
    });
  }

  it("em sub-rota /config/avancado o link Configurações NÃO fica ativo (match exato)", () => {
    mockPathname = "/config/avancado";
    render(<Header />);
    const link = navLink("Configurações");
    expect(link.className).not.toContain("bg-aqua-surface-2");
    expect(link.className).toContain("text-aqua-text-muted");
  });
});

describe("Header — nav horizontal usa breakpoint lg", () => {
  it("a nav tem hidden e lg:flex (aparece só em lg+)", () => {
    render(<Header />);
    const nav = screen.getByText("Configurações").closest("nav")!;
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("lg:flex");
  });
});
