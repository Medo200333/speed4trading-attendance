import { BRAND } from '@/lib/brand';
import { Card, useCenter } from './access-ui';
export function BrandAbout() {
  const { data } = useCenter();
  return (
    <Card title={`حول ${BRAND.name}`}>
      <p>برنامج من إنتاج <strong>{BRAND.name}</strong> · الإصدار {BRAND.version}</p>
      <p>الشركة: <strong>{data.company?.nameAr || "—"}</strong> — يظهر اسمها وشعارها في الواجهة وكل التقارير.</p>
      <p>نظام إدارة أجهزة Hikvision والموظفين ووسائل التحقق والأبواب والحضور. تختلف الوظائف حسب الموديل والقدرات المقروءة.</p>
    </Card>
  );
}
