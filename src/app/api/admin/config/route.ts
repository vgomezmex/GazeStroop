import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/adminAuth';

// GET is intentionally public (no requireAdmin): the participant-facing
// app (consent form, experiment timing, block order, eye tracker settings,
// etc.) reads this on every page load to know how to run the experiment —
// it's configuration the experiment needs to function, not admin-only
// data. Only writing configuration (POST, below) requires an admin
// session. Nothing sensitive (credentials, secrets) is stored in
// ExperimentConfig.
export async function GET() {
  try {
    const configs = await db.experimentConfig.findMany();
    const configObj: Record<string, string> = {};
    for (const c of configs) {
      configObj[c.key] = c.value;
    }
    return NextResponse.json(configObj);
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const entries = body as Record<string, string>;

    for (const [key, value] of Object.entries(entries)) {
      await db.experimentConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    await db.auditLog.create({
      data: {
        action: 'config_update',
        details: `Configuración actualizada: ${Object.keys(entries).join(', ')}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
