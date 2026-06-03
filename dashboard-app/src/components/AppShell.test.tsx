import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Header } from "@/components/AppShell";

let mockPathname = "/";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: mockPathname }),
  Link: ({ children, ...props }: any) => (
    <a {...props} href={props.to ?? "#"}>{children}</a>
  ),
}));

beforeEach(() => {
  mockPathname = "/";
});
afterEach(cleanup);

describe("Header — engrenagem /config responsiva", () => {
  it("engrenagem usa breakpoint lg (não md) e aponta para /config", () => {
    render(<Header />);
    const gear = screen.getByLabelText("Abrir configurações");
    expect(gear).toHaveAttribute("href", "/config");
    expect(gear.className).toContain("lg:hidden");
    expect(gear.className).not.toContain("md:hidden");
  });

  it("engrenagem mantém área de toque >= 44px", () => {
    render(<Header />);
    const gear = screen.getByLabelText("Abrir configurações");
    expect(gear.className).toContain("h-11");
    expect(gear.className).toContain("w-11");
  });
});

describe("Header — classNames nos limites de breakpoint", () => {
  // Tailwind: `lg` = 1024px. A engrenagem (lg:hidden) está visível em
  // larguras < 1024 e some em >= 1024; a nav horizontal (lg:flex, hidden por
  // padrão) é o inverso. Testamos os classNames que regem essa troca em
  // 768px, 1023px e 1024px — todos abaixo de lg, exceto 1024 que é o ponto
  // exato em que a nav assume.
  const cases = [
    { width: 768, gearVisible: true },
    { width: 1023, gearVisible: true },
    { width: 1024, gearVisible: false },
  ] as const;

  for (const { width } of cases) {
    it(`em ${width}px os classNames de troca lg estão corretos`, () => {
      render(<Header />);
      const gear = screen.getByLabelText("Abrir configurações");
      const nav = screen.getByText("Configurações").closest("nav")!;

      // Engrenagem: visível até lg, esconde a partir de lg (lg:hidden).
      expect(gear.className).toContain("lg:hidden");
      expect(gear.className).not.toContain("md:hidden");

      // Ícone Settings dentro da engrenagem: tamanho responsivo em lg.
      const icon = gear.querySelector("svg")!;
      expect(icon.getAttribute("class")).toContain("h-5");
      expect(icon.getAttribute("class")).toContain("w-5");
      expect(icon.getAttribute("class")).toContain("lg:h-4");
      expect(icon.getAttribute("class")).toContain("lg:w-4");

      // Nav horizontal: oculta por padrão, aparece só em lg (lg:flex).
      expect(nav.className).toContain("hidden");
      expect(nav.className).toContain("lg:flex");
    });
  }
});

describe("Header — feedback de rota ativa da engrenagem", () => {
  it("aplica classes de realce quando pathname começa com /config", () => {
    mockPathname = "/config";
    render(<Header />);
    const gear = screen.getByLabelText("Abrir configurações");
    expect(gear.className).toContain("border-aqua-accent/40");
    expect(gear.className).toContain("bg-aqua-accent/10");
    expect(gear.className).toContain("text-aqua-accent");
  });

  it("aplica realce em sub-rotas de /config (ex.: /config/avancado)", () => {
    mockPathname = "/config/avancado";
    render(<Header />);
    const gear = screen.getByLabelText("Abrir configurações");
    expect(gear.className).toContain("text-aqua-accent");
  });

  it("não aplica realce fora de /config", () => {
    mockPathname = "/";
    render(<Header />);
    const gear = screen.getByLabelText("Abrir configurações");
    expect(gear.className).not.toContain("text-aqua-accent");
    expect(gear.className).toContain("text-aqua-text-muted");
  });
});

describe("Header — engrenagem e link de menu nunca coexistem (320–1440px)", () => {
  // A engrenagem (lg:hidden) e o link "Configurações" da nav (lg:flex, hidden)
  // são mutuamente exclusivos: a engrenagem aparece abaixo de 1024px e a nav
  // a partir de 1024px. Verificamos via classNames que não há sobreposição em
  // nenhuma largura do intervalo 320–1440px.
  const widths = [320, 375, 414, 640, 768, 834, 1023, 1024, 1280, 1440];

  for (const width of widths) {
    it(`em ${width}px apenas um acesso a /config está ativo`, () => {
      render(<Header />);
      const gear = screen.getByLabelText("Abrir configurações");
      const nav = screen.getByText("Configurações").closest("nav")!;

      const gearHidesAtLg = gear.className.includes("lg:hidden");
      const navShowsOnlyAtLg =
        nav.className.includes("hidden") && nav.className.includes("lg:flex");

      // Garantia da exclusividade: engrenagem some exatamente onde a nav surge.
      expect(gearHidesAtLg).toBe(true);
      expect(navShowsOnlyAtLg).toBe(true);

      const below = width < 1024;
      // Abaixo de lg: engrenagem visível, nav oculta.
      // A partir de lg: engrenagem oculta, nav visível.
      const gearVisible = gearHidesAtLg ? below : true;
      const navVisible = navShowsOnlyAtLg ? !below : true;
      expect(gearVisible && navVisible).toBe(false);
    });
  }
});

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
    { to: "/controle", label: "Aquecimento" },
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

  it("em sub-rota /config/avancado o link do menu NÃO fica ativo (match exato)", () => {
    // A nav usa igualdade exata de pathname; sub-rotas não acendem o item.
    mockPathname = "/config/avancado";
    render(<Header />);
    const link = navLink("Configurações");
    expect(link.className).not.toContain("bg-aqua-surface-2");
    expect(link.className).toContain("text-aqua-text-muted");
  });
});

describe("Header — engrenagem ativa em /config e /config/*", () => {
  const ACTIVE = ["border-aqua-accent/40", "bg-aqua-accent/10", "text-aqua-accent"];

  for (const path of ["/config", "/config/", "/config/avancado", "/config/mqtt/topicos"]) {
    it(`acende a engrenagem em ${path}`, () => {
      mockPathname = path;
      render(<Header />);
      const gear = screen.getByLabelText("Abrir configurações");
      for (const c of ACTIVE) expect(gear.className).toContain(c);
    });
  }

  for (const path of ["/", "/graficos", "/alertas"]) {
    it(`NÃO acende a engrenagem em ${path}`, () => {
      mockPathname = path;
      render(<Header />);
      const gear = screen.getByLabelText("Abrir configurações");
      expect(gear.className).not.toContain("text-aqua-accent");
      expect(gear.className).toContain("text-aqua-text-muted");
    });
  }
});
