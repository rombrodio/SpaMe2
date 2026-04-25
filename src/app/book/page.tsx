import { BookFlow } from "@/components/book/book-flow";
import { getPublicServices } from "@/lib/actions/book";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await getPublicServices();
  const t = await getTranslations("customer.book");

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="mt-1 text-stone-600">{t("stepService.subheading")}</p>
      </header>

      <BookFlow services={services} />
    </div>
  );
}
