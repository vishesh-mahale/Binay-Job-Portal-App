'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Filter } from 'lucide-react';
import type { PublicJobSearchFilters } from '@/types/jobs';

export interface PublicJobFiltersProps {
  filters: PublicJobSearchFilters;
  categories: { id: string; name: string }[];
  onFilterChange: (newFilters: Partial<PublicJobSearchFilters>) => void;
  onClearFilters: () => void;
  isLoading?: boolean;
}

export function PublicJobFilters({
  filters,
  categories,
  onFilterChange,
  onClearFilters,
  isLoading = false,
}: PublicJobFiltersProps) {
  const [keywordInput, setKeywordInput] = React.useState(filters.q || '');

  // Keep internal keyword in sync with external prop changes
  React.useEffect(() => {
    setKeywordInput(filters.q || '');
  }, [filters.q]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ q: keywordInput.trim() || undefined });
  };

  const handleClearKeyword = () => {
    setKeywordInput('');
    onFilterChange({ q: undefined });
  };

  const hasActiveFilters = Boolean(
    filters.q ||
    filters.work_mode ||
    filters.employment_type ||
    filters.category_id ||
    filters.location_country
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 md:p-6 shadow-sm space-y-4">
      {/* Search Input Row */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2" data-testid="search-form">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by job title, role, or keywords (e.g. HR, Engineer, Python)..."
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            className="pl-9 pr-8 h-11"
            data-testid="search-input"
          />
          {keywordInput && (
            <button
              type="button"
              onClick={handleClearKeyword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={isLoading} className="h-11 px-6 gap-2" data-testid="search-button">
          <Search className="w-4 h-4" /> Search
        </Button>
      </form>

      {/* Filter Selectors Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        {/* Category Filter */}
        <div>
          <label htmlFor="category-select" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Category
          </label>
          <select
            id="category-select"
            data-testid="filter-category"
            value={filters.category_id || ''}
            onChange={(e) => onFilterChange({ category_id: e.target.value || undefined })}
            className="w-full h-9 text-sm rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Work Mode Filter */}
        <div>
          <label htmlFor="work-mode-select" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Work Mode
          </label>
          <select
            id="work-mode-select"
            data-testid="filter-work-mode"
            value={filters.work_mode || ''}
            onChange={(e) => onFilterChange({ work_mode: e.target.value || undefined })}
            className="w-full h-9 text-sm rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All Work Modes</option>
            <option value="onsite">Onsite</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        {/* Employment Type Filter */}
        <div>
          <label htmlFor="employment-type-select" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Job Type
          </label>
          <select
            id="employment-type-select"
            data-testid="filter-employment-type"
            value={filters.employment_type || ''}
            onChange={(e) => onFilterChange({ employment_type: e.target.value || undefined })}
            className="w-full h-9 text-sm rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All Types</option>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>

        {/* Country / Location Filter */}
        <div>
          <label htmlFor="country-input" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Country
          </label>
          <Input
            id="country-input"
            data-testid="filter-country"
            type="text"
            placeholder="e.g. India"
            value={filters.location_country || ''}
            onChange={(e) => onFilterChange({ location_country: e.target.value.trim() || undefined })}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Active Filter Indicators and Clear Action */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Active filters applied</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-7 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white gap-1"
            data-testid="clear-filters-button"
          >
            <X className="w-3.5 h-3.5" /> Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
