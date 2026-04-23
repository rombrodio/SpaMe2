import { BookFlow } from "@/components/book/book-flow";
import { getPublicServices } from "@/lib/actions/book";
import { he } from "@/lib/i18n/he";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const services = await getPublicServices();

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{he.book.pageTitle}</h1>
        <p className="mt-1 text-stone-600">
          {he.book.stepService.subheading}
        </p>
      </header>

      <BookFlow services={services} />
    </div>
  );
}
