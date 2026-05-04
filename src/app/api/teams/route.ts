import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Helper: generate a URL-friendly slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Helper: generate a unique slug by appending a short numeric suffix if needed
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;

  while (await db.team.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return slug;
}

// GET /api/teams — List user's teams
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const teamMemberships = await db.teamMember.findMany({
      where: { userId: session.user.id, status: "active" },
      include: {
        team: {
          include: {
            owner: {
              select: { id: true, name: true, email: true, image: true },
            },
            _count: {
              select: { members: true, projects: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const teams = teamMemberships.map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      description: membership.team.description,
      avatarUrl: membership.team.avatarUrl,
      owner: membership.team.owner,
      memberCount: membership.team._count.members,
      projectCount: membership.team._count.projects,
      role: membership.role,
      joinedAt: membership.joinedAt,
    }));

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("Failed to fetch teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}

// POST /api/teams — Create a new team
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, maxMembers } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Team name is required" },
        { status: 400 }
      );
    }

    // Check that user has a "team" plan from the Subscription table
    const subscription = await db.subscription.findUnique({
      where: { userId: session.user.id },
    });

    if (!subscription || subscription.plan !== "team") {
      return NextResponse.json(
        {
          error:
            "A team plan is required to create teams. Please upgrade your subscription.",
        },
        { status: 403 }
      );
    }

    const baseSlug = generateSlug(name.trim());
    const slug = await ensureUniqueSlug(baseSlug);

    // Create Team and owner TeamMember in a transaction
    const team = await db.$transaction(async (tx) => {
      const newTeam = await tx.team.create({
        data: {
          name: name.trim(),
          slug,
          description: description ?? null,
          maxMembers: maxMembers ?? 10,
          ownerUserId: session.user.id,
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true },
          },
          members: true,
        },
      });

      await tx.teamMember.create({
        data: {
          teamId: newTeam.id,
          userId: session.user.id,
          role: "owner",
          status: "active",
        },
      });

      return newTeam;
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error("Failed to create team:", error);
    return NextResponse.json(
      { error: "Failed to create team" },
      { status: 500 }
    );
  }
}
