import { GalleryLayout } from '@/components/gallery-layout';

export default function GalleryPageRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GalleryLayout>{children}</GalleryLayout>;
}
