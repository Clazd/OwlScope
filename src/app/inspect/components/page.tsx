import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { Gallery } from "@/components/inspect/Gallery";

export const metadata = { title: "Component gallery — Persona Studio" };

export default function ComponentGalleryPage() {
  return (
    <>
      <PageHeader
        title="Component gallery"
        subtitle="Every component in the inventory, in every state it has"
      />
      <PageBody wide>
        <p className="type-small reading-column text-ink-3">
          No component here contains a raw hex value. Every colour comes from a token, which is what
          makes the theme switch work and what keeps saturated colour meaning exactly one thing.
        </p>
        <Gallery />
      </PageBody>
    </>
  );
}
