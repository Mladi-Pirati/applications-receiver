"use client";

import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildMembershipApplicationDetailsHref,
  getMembershipApplicationStatusVariant,
  membershipApplicationStatusLabels,
  participationModeLabels,
  type MembershipApplicationStatus,
  type ParticipationMode,
  type ResidenceRegion,
} from "@/lib/membership-applications";

export type MembershipApplicationListRow = {
  id: string;
  fullName: string;
  cityAndPostalCode: string;
  residenceRegion: ResidenceRegion;
  email: string;
  participationMode: ParticipationMode;
  status: MembershipApplicationStatus;
  createdAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function MembershipApplicationsManagement({
  queryString,
  rows,
}: {
  queryString: string;
  rows: MembershipApplicationListRow[];
}) {
  const columns: ColumnDef<MembershipApplicationListRow>[] = [
    {
      accessorKey: "fullName",
      header: "Applicant",
      size: 220,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.original.fullName}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      size: 220,
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">
          {row.original.email}
        </span>
      ),
    },
    {
      id: "location",
      header: "Region / city",
      size: 240,
      cell: ({ row }) => (
        <span
          className="block truncate text-muted-foreground"
          title={`${row.original.cityAndPostalCode} - ${row.original.residenceRegion}`}
        >
          {row.original.cityAndPostalCode} - {row.original.residenceRegion}
        </span>
      ),
    },
    {
      accessorKey: "participationMode",
      header: "Participation",
      size: 180,
      cell: ({ row }) => (
        <span className="block truncate">
          {participationModeLabels[row.original.participationMode]}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 140,
      cell: ({ row }) => (
        <Badge variant={getMembershipApplicationStatusVariant(row.original.status)}>
          {membershipApplicationStatusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 180,
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 96,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild size="xs" variant="outline">
            <Link
              href={buildMembershipApplicationDetailsHref(
                row.original.id,
                queryString,
              )}
              prefetch={false}
            >
              View
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Applications queue</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {table.getRowModel().rows.length ? (
          <Table className="table-fixed" style={{ width: table.getTotalSize() }}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-48 items-center justify-center px-4 text-center text-xs text-muted-foreground">
            No applications match the current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
