import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { createServiceCategoryAction, deleteServiceCategoryAction } from '@/app/admin/actions';

export const revalidate = 0;

export default async function AdminCategoriesPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  if (session.role === 'STAFF') {
    redirect('/admin/marketer');
  }
  const categories = await db.serviceCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { services: true },
      },
    },
  });

  async function handleCreateCategory(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    if (name) {
      await createServiceCategoryAction({ name, description });
      revalidatePath('/admin/categories');
    }
  }

  async function handleDeleteCategory(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    if (id) {
      await deleteServiceCategoryAction(id);
      revalidatePath('/admin/categories');
    }
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Categories</h1>
          <p className="text-sm text-slate-500">Manage massage therapy categories and treatment groupings.</p>
        </div>
      </div>

      {/* Category Creation Form */}
      <form action={handleCreateCategory} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Add New Category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Category Name</label>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g., Deep Tissue, Swedish, Prenatal"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Description</label>
            <input
              name="description"
              type="text"
              placeholder="Brief summary of treatments in this category"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Create Category
        </button>
      </form>

      {/* Category List */}
      {categories.length === 0 ? (
        <div className="bg-white p-8 text-center text-slate-500 rounded-xl border border-slate-200 shadow-sm text-sm">
          No service categories found. Create your first category above.
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="px-6 py-3">Category Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Assigned Services</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold text-slate-900">{cat.name}</td>
                      <td className="px-6 py-4 text-slate-600">{cat.description || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{cat._count.services} service(s)</td>
                      <td className="px-6 py-4 text-right">
                        <form action={handleDeleteCategory} className="inline">
                          <input type="hidden" name="id" value={cat.id} />
                          <button
                            type="submit"
                            className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-4">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-900 text-base">{cat.name}</span>
                  <span className="text-xs text-slate-500">{cat._count.services} service(s)</span>
                </div>
                {cat.description && (
                  <p className="text-xs text-slate-600">{cat.description}</p>
                )}
                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <form action={handleDeleteCategory}>
                    <input type="hidden" name="id" value={cat.id} />
                    <button
                      type="submit"
                      className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
