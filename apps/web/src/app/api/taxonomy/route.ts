import { NextResponse } from 'next/server';
import { getTaxonomy } from '@geotrack/config';

export async function GET() {
  const taxonomy = getTaxonomy();
  return NextResponse.json({
    categories: taxonomy.map((c) => ({ id: c.id, name: c.name })),
  });
}
