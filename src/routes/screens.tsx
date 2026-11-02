import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/screens")({
  head: () => ({ meta: [{ title: "Скриншоты для App Store" }, { name: "robots", content: "noindex" }] }),
  component: Screens,
});

const SETS = [
  { title: "Средний iPhone (1179 × 2556)", dir: "appstore-mid" },
  { title: "Запасной вариант (1206 × 2622)", dir: "appstore-mid2" },
  { title: "Большой iPhone (1290 × 2796)", dir: "appstore" },
];

function Screens() {
  return (
    <div className="min-h-screen bg-white px-4 py-8 text-neutral-900">
      <h1 className="mb-2 text-2xl font-bold">Скриншоты для App Store</h1>
      <p className="mb-8 text-neutral-600">Нажмите «Скачать» под каждой картинкой.</p>
      {SETS.map((set) => (
        <section key={set.dir} className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">{set.title}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => {
              const src = `/${set.dir}/screen-${i}.png`;
              return (
                <div key={i} className="flex flex-col gap-2">
                  <img src={src} alt={`Скриншот ${i}`} className="w-full rounded-xl border border-neutral-200" />
                  <a
                    href={src}
                    download={`${set.dir}-screen-${i}.png`}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Скачать {i}
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
