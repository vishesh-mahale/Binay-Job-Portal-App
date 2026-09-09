'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import type { CompanySettings, Job, JobStatus, InterviewRoundItem } from '@/types/jobs';

interface JobPostingManagerProps {
  companyId: string;
  verificationStatus: string;
  isOwnerOrAdmin: boolean;
  branches?: any[];
  departments?: any[];
  teams?: any[];
}

export function JobPostingManager({
  companyId,
  verificationStatus,
  isOwnerOrAdmin,
  branches = [],
  departments = [],
  teams = [],
}: JobPostingManagerProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');

  const [loading, setLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create / Edit Draft Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');

  // Extended Production Fields
  const [category, setCategory] = useState<string>('Engineering');
  const [employmentType, setEmploymentType] = useState<string>('full_time');
  const [workMode, setWorkMode] = useState<string>('onsite');
  const [experienceLevel, setExperienceLevel] = useState<string>('senior');
  const [experienceMin, setExperienceMin] = useState<string>('');
  const [experienceMax, setExperienceMax] = useState<string>('');
  const [workShift, setWorkShift] = useState<string>('day');
  const [educationType, setEducationType] = useState<string>('any');
  const [minEducationLevel, setMinEducationLevel] = useState<string>('unspecific');
  const [interviewRounds, setInterviewRounds] = useState<InterviewRoundItem[]>([]);
  const [maxNoticePeriodDays, setMaxNoticePeriodDays] = useState<string>('');
  const [salaryMin, setSalaryMin] = useState<string>('');
  const [salaryMax, setSalaryMax] = useState<string>('');
  const [salaryCurrency, setSalaryCurrency] = useState<string>('INR');
  const [salaryPeriod, setSalaryPeriod] = useState<string>('yearly');
  const [salaryVisible, setSalaryVisible] = useState<boolean>(true);
  const [responsibilities, setResponsibilities] = useState<string>('');
  const [requirements, setRequirements] = useState<string>('');
  const [preferredQualifications, setPreferredQualifications] = useState<string>('');
  const [benefits, setBenefits] = useState<string>('');
  const [locationCity, setLocationCity] = useState<string>('');
  const [locationState, setLocationState] = useState<string>('');
  const [locationCountry, setLocationCountry] = useState<string>('India');
  const [additionalLocations, setAdditionalLocations] = useState<Array<{ city: string; state: string; country: string; isCustom?: boolean }>>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState<string>('');
  const [skillNotice, setSkillNotice] = useState<{ message: string; kind: 'warning' | 'success' } | null>(null);
  const skillNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [vacancies, setVacancies] = useState<number>(1);
  const [isConfidential, setIsConfidential] = useState<boolean>(false);
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [isFeatured, setIsFeatured] = useState<boolean>(false);

  const toggleSkillSelect = (skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  const normalizeSkillName = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

  const handleAddCustomSkill = () => {
    const enteredSkills = Array.from(new Map(customSkillInput
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)
      .map((skill) => [normalizeSkillName(skill), skill] as const)).values());
    if (enteredSkills.length === 0) return;

    // Build normalized master list once
    const normalizedMasters = dbSkills.map((master) => ({
      id: master.id,
      name: master.name || '',
      norm: normalizeSkillName(master.name || ''),
    }));

    // For each entered skill: check exact OR partial overlap with any master skill
    const findMasterMatch = (entered: string) => {
      const normEntered = normalizeSkillName(entered);
      return normalizedMasters.find(
        (m) =>
          m.norm === normEntered ||           // exact match
          m.norm.includes(normEntered) ||     // master contains custom  (e.g. "html5/css3" contains "html")
          normEntered.includes(m.norm)        // custom contains master  (e.g. "nodejs" contains "node")
      ) ?? null;
    };

    const existingCustomNorms = new Set(customSkills.map(normalizeSkillName));

    const masterAutoSelect: typeof normalizedMasters = [];
    const alreadySelectedMasters: typeof normalizedMasters = [];
    const alreadyInCustom: string[] = [];
    const newCustomSkills: string[] = [];

    for (const skill of enteredSkills) {
      const normSkill = normalizeSkillName(skill);

      // Already in custom list?
      if (existingCustomNorms.has(normSkill)) {
        alreadyInCustom.push(skill);
        continue;
      }

      // Matches a master skill?
      const masterMatch = findMasterMatch(skill);
      if (masterMatch) {
        if (selectedSkillIds.includes(masterMatch.id)) {
          alreadySelectedMasters.push(masterMatch);
        } else {
          masterAutoSelect.push(masterMatch);
        }
        continue;
      }

      // Pure new custom skill
      newCustomSkills.push(skill);
    }

    // Apply state changes
    if (newCustomSkills.length > 0) {
      setCustomSkills((prev) => [...prev, ...newCustomSkills]);
    }
    if (masterAutoSelect.length > 0) {
      setSelectedSkillIds((prev) => Array.from(new Set([...prev, ...masterAutoSelect.map((m) => m.id)])));
    }
    setCustomSkillInput('');

    // Build notice message
    if (skillNoticeTimer.current) clearTimeout(skillNoticeTimer.current);

    const parts: string[] = [];
    if (masterAutoSelect.length > 0) {
      parts.push(
        `"${masterAutoSelect.map((m) => m.name).join('", "')}" already exist in Master Skills — auto-selected there instead.`
      );
    }
    if (alreadySelectedMasters.length > 0) {
      parts.push(
        `"${alreadySelectedMasters.map((m) => m.name).join('", "')}" already selected in Master Skills.`
      );
    }
    if (alreadyInCustom.length > 0) {
      parts.push(`"${alreadyInCustom.join('", "')}" already in Custom Skills.`);
    }
    if (newCustomSkills.length > 0) {
      parts.push(`${newCustomSkills.length} custom skill${newCustomSkills.length > 1 ? 's' : ''} added.`);
    }

    if (parts.length > 0) {
      const hasWarning = masterAutoSelect.length > 0 || alreadySelectedMasters.length > 0 || alreadyInCustom.length > 0;
      setSkillNotice({ message: parts.join(' '), kind: hasWarning ? 'warning' : 'success' });
      skillNoticeTimer.current = setTimeout(() => setSkillNotice(null), 10000);
    }
  };

  useEffect(() => () => {
    if (skillNoticeTimer.current) clearTimeout(skillNoticeTimer.current);
  }, []);

  const handleRemoveCustomSkill = (skillName: string) => {
    setCustomSkills((prev) => prev.filter((s) => s !== skillName));
  };

  const handleAddLocation = () => {
    setAdditionalLocations((prev) => [...prev, { city: '', state: '', country: 'India' }]);
  };

  const handleRemoveLocation = (index: number) => {
    setAdditionalLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLocationChange = (index: number, field: 'city' | 'state' | 'country', value: string) => {
    setAdditionalLocations((prev) =>
      prev.map((loc, i) => (i === index ? { ...loc, [field]: value } : loc))
    );
  };

  const handleAddInterviewRound = () => {
    setInterviewRounds((prev) => [
      ...prev,
      { round: prev.length + 1, name: '', description: '' },
    ]);
  };

  const handleRemoveInterviewRound = (index: number) => {
    setInterviewRounds((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, round: i + 1 }))
    );
  };

  const handleInterviewRoundChange = (index: number, field: 'name' | 'description', value: string) => {
    setInterviewRounds((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Reason inputs for Reject & Archive
  const [rejectReasonMap, setRejectReasonMap] = useState<Record<string, string>>({});
  const [archiveReasonMap, setArchiveReasonMap] = useState<Record<string, string>>({});

  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbSkills, setDbSkills] = useState<any[]>([]);
  const [dbCities, setDbCities] = useState<any[]>([]);
  const [isCustomPrimaryCity, setIsCustomPrimaryCity] = useState(false);

  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setInitialLoading(true);
    setError(null);
    setCatalogError(null);

    // 1. Critical primary data: Company jobs & Company settings (Fail-visible)
    try {
      const [jobList, companySettings] = await Promise.all([
        apiClient.listCompanyJobs(companyId),
        apiClient.getCompanySettings(companyId),
      ]);
      setJobs(jobList || []);
      setSettings(companySettings);
    } catch (err: any) {
      setError(err.message || 'Failed to load company jobs or settings. Please check permissions or network connection.');
      setInitialLoading(false);
      return;
    }

    // 2. Secondary master catalogs (categories, skills, cities) with explicit warning
    try {
      const [masterCats, masterSk, masterCt] = await Promise.all([
        apiClient.listJobCategories().catch(() => null),
        apiClient.listSkills().catch(() => null),
        apiClient.listCities().catch(() => null),
      ]);
      if (masterCats === null || masterSk === null || masterCt === null) {
        setCatalogError('Warning: Failed to load complete master catalogs (categories, skills, or cities). Some dropdowns may have limited options.');
      }
      setDbCategories(masterCats || []);
      setDbSkills(masterSk || []);
      setDbCities(masterCt || []);
    } catch {
      setCatalogError('Warning: Failed to load master catalogs.');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    const autoSlug = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    setSlug(autoSlug);
  };

  const handleOpenCreateForm = () => {
    setEditingJobId(null);
    setTitle('');
    setSlug('');
    setDescription('');
    setBranchId('');
    setDepartmentId('');
    setTeamId('');
    setCategory('Engineering');
    setEmploymentType('full_time');
    setWorkMode('onsite');
    setExperienceLevel('senior');
    setExperienceMin('');
    setExperienceMax('');
    setWorkShift('day');
    setEducationType('any');
    setMinEducationLevel('unspecific');
    setInterviewRounds([]);
    setMaxNoticePeriodDays('');
    setSalaryMin('');
    setSalaryMax('');
    setSalaryCurrency('INR');
    setSalaryPeriod('yearly');
    setSalaryVisible(true);
    setResponsibilities('');
    setRequirements('');
    setPreferredQualifications('');
    setBenefits('');
    setLocationCity('');
    setLocationState('');
    setLocationCountry('India');
    setAdditionalLocations([]);
    setSelectedSkillIds([]);
    setCustomSkills([]);
    setCustomSkillInput('');
    setVacancies(1);
    setIsConfidential(false);
    setIsUrgent(false);
    setIsFeatured(false);
    setIsFormOpen(true);
    setError(null);
  };

  const handleOpenEditForm = (job: Job) => {
    setEditingJobId(job.id);
    setTitle(job.title);
    setSlug(job.slug);
    setDescription(job.description);
    setBranchId(job.branch_id || '');
    setDepartmentId(job.department_id || '');
    setTeamId(job.team_id || '');
    setCategory(job.category || 'Engineering');
    setEmploymentType(job.employment_type || 'full_time');
    setWorkMode(job.work_mode || 'onsite');
    setExperienceLevel(job.experience_level || 'senior');
    setExperienceMin(job.experience_min !== undefined && job.experience_min !== null ? String(job.experience_min) : '');
    setExperienceMax(job.experience_max !== undefined && job.experience_max !== null ? String(job.experience_max) : '');
    setWorkShift(job.work_shift || 'day');
    setEducationType(job.education_type || 'any');
    setMinEducationLevel(job.min_education_level || 'unspecific');
    setInterviewRounds(job.interview_rounds || []);
    setMaxNoticePeriodDays(job.max_notice_period_days !== undefined && job.max_notice_period_days !== null ? String(job.max_notice_period_days) : '');
    setSalaryMin(job.salary_min !== undefined && job.salary_min !== null ? String(job.salary_min) : '');
    setSalaryMax(job.salary_max !== undefined && job.salary_max !== null ? String(job.salary_max) : '');
    setSalaryCurrency(job.salary_currency || 'INR');
    setSalaryPeriod(job.salary_period || 'yearly');
    setSalaryVisible(job.salary_visible !== undefined && job.salary_visible !== null ? job.salary_visible : true);
    setResponsibilities(job.responsibilities || '');
    setRequirements(job.requirements || '');
    setPreferredQualifications(job.preferred_qualifications || '');
    setBenefits(job.benefits || '');
    if (job.locations && Array.isArray(job.locations) && job.locations.length > 0) {
      const primary = job.locations.find((l) => l.is_primary) || job.locations[0];
      const pCity = primary.city || '';
      setLocationCity(pCity);
      setLocationState(primary.state || '');
      setLocationCountry(primary.country || 'India');
      setIsCustomPrimaryCity(Boolean(pCity && !dbCities.some((c) => c.name.toLowerCase() === pCity.trim().toLowerCase())));

      const secondaries = job.locations.filter((l) => l !== primary && (!primary.id || l.id !== primary.id) && !l.is_primary);
      setAdditionalLocations(
        secondaries.map((l) => {
          const sCity = l.city || '';
          const isCustom = Boolean(sCity && !dbCities.some((c) => c.name.toLowerCase() === sCity.trim().toLowerCase()));
          return {
            city: sCity,
            state: l.state || '',
            country: l.country || 'India',
            isCustom,
          };
        })
      );
    } else {
      const pCity = job.location_city || '';
      setLocationCity(pCity);
      setLocationState(job.location_state || '');
      setLocationCountry(job.location_country || 'India');
      setIsCustomPrimaryCity(Boolean(pCity && !dbCities.some((c) => c.name.toLowerCase() === pCity.trim().toLowerCase())));
      setAdditionalLocations([]);
    }
    setSelectedSkillIds(job.skills ? job.skills.map((s) => s.skill_id) : []);
    setCustomSkills(Array.isArray(job.custom_skills) ? job.custom_skills : []);
    setCustomSkillInput('');
    setVacancies(job.vacancies !== undefined && job.vacancies !== null ? job.vacancies : 1);
    setIsConfidential(Boolean(job.is_confidential));
    setIsUrgent(Boolean(job.is_urgent));
    setIsFeatured(Boolean(job.is_featured));
    setIsFormOpen(true);
    setError(null);
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const validLocs = [];
      if (locationCity.trim()) {
        validLocs.push({
          city: locationCity.trim(),
          state: locationState.trim() || null,
          country: locationCountry.trim() || 'India',
          is_primary: true,
        });
      }
      for (const addLoc of additionalLocations) {
        if (addLoc.city.trim()) {
          validLocs.push({
            city: addLoc.city.trim(),
            state: addLoc.state.trim() || null,
            country: addLoc.country.trim() || 'India',
            is_primary: false,
          });
        }
      }

      const expMinNum = experienceMin !== '' ? Number(experienceMin) : undefined;
      const expMaxNum = experienceMax !== '' ? Number(experienceMax) : undefined;

      if (expMinNum !== undefined && expMaxNum !== undefined && expMaxNum < expMinNum) {
        setError('Max Experience cannot be less than Min Experience.');
        setLoading(false);
        return;
      }
      let derivedExpLevel = 'mid';
      if (expMinNum !== undefined) {
        if (expMinNum <= 2) derivedExpLevel = 'entry';
        else if (expMinNum <= 3) derivedExpLevel = 'junior';
        else if (expMinNum <= 5) derivedExpLevel = 'mid';
        else if (expMinNum <= 8) derivedExpLevel = 'senior';
        else if (expMinNum <= 12) derivedExpLevel = 'lead';
        else derivedExpLevel = 'principal';
      }

      let reqText = requirements.trim();

      const allSkillsInput = [
        ...selectedSkillIds.map((id) => ({ skill_id: id, is_required: true, min_years: 1, importance_score: 5 })),
      ];

      const validRounds = interviewRounds
        .filter((r) => r.name.trim() !== '')
        .map((r, i) => ({
          round: i + 1,
          name: r.name.trim(),
          description: r.description?.trim() || undefined,
        }));

      const selectedCat = dbCategories.find((cat) => cat.name === category);
      const categoryId = selectedCat ? selectedCat.id : undefined;

      const dto = {
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim(),
        branch_id: branchId || undefined,
        department_id: departmentId || undefined,
        team_id: teamId || undefined,
        category,
        category_id: categoryId,
        employment_type: employmentType,
        work_mode: workMode,
        experience_level: derivedExpLevel,
        experience_min: expMinNum,
        experience_max: expMaxNum,
        work_shift: workShift || undefined,
        education_type: educationType || undefined,
        min_education_level: minEducationLevel || undefined,
        interview_rounds: validRounds.length > 0 ? validRounds : undefined,
        max_notice_period_days: maxNoticePeriodDays !== '' ? Number(maxNoticePeriodDays) : undefined,
        salary_min: salaryMin ? Number(salaryMin) : undefined,
        salary_max: salaryMax ? Number(salaryMax) : undefined,
        salary_currency: salaryCurrency,
        salary_period: salaryPeriod,
        salary_visible: salaryVisible,
        responsibilities: responsibilities.trim() || undefined,
        requirements: reqText || undefined,
        preferred_qualifications: preferredQualifications.trim() || undefined,
        benefits: benefits.trim() || undefined,
        location_city: locationCity.trim() || undefined,
        location_state: locationState.trim() || undefined,
        location_country: locationCountry.trim() || undefined,
        locations: validLocs.length > 0 ? validLocs : undefined,
        skills: allSkillsInput.length > 0 ? allSkillsInput : undefined,
        custom_skills: customSkills,
        vacancies,
        is_confidential: isConfidential,
        is_urgent: isUrgent,
        is_featured: isFeatured,
      };

      if (editingJobId) {
        const updated = await apiClient.updateJob(companyId, editingJobId, dto);
        setJobs((prev) => prev.map((j) => (j.id === editingJobId ? updated : j)));
        setSuccessMsg(`Draft job '${updated.title}' updated successfully!`);
      } else {
        const created = await apiClient.createJob(companyId, dto);
        setJobs((prev) => [created, ...prev]);
        setSuccessMsg(`Draft job '${created.title}' created successfully!`);
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save job draft');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApprovalSetting = async () => {
    if (!settings) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.updateCompanySettings(companyId, {
        job_approval_required: !settings.job_approval_required,
      });
      setSettings(updated);
      setSuccessMsg(`Job approval policy updated: ${updated.job_approval_required ? 'REQUIRED' : 'DIRECT PUBLISH'}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update company settings');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.publishJob(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      if (updated.status === 'published') {
        setSuccessMsg(`Job '${updated.title}' published successfully!`);
      } else {
        setSuccessMsg(`Job '${updated.title}' submitted for approval (pending Owner/Admin review).`);
      }
    } catch (err: any) {
      setError(err.message || 'Publish action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.submitJobForApproval(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' submitted for approval!`);
    } catch (err: any) {
      setError(err.message || 'Submit for approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.approveJob(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' approved & published!`);
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (jobId: string) => {
    const reason = rejectReasonMap[jobId]?.trim();
    if (!reason) {
      setError('Please provide a reason for rejecting the job posting.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.rejectJob(companyId, jobId, reason);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' rejected and returned to draft.`);
      setRejectReasonMap((prev) => ({ ...prev, [jobId]: '' }));
    } catch (err: any) {
      setError(err.message || 'Rejection failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.pauseJob(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' paused.`);
    } catch (err: any) {
      setError(err.message || 'Pause failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.resumeJob(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' resumed & published!`);
    } catch (err: any) {
      setError(err.message || 'Resume failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async (jobId: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.closeJob(companyId, jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' closed.`);
    } catch (err: any) {
      setError(err.message || 'Close failed');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (jobId: string) => {
    const reason = archiveReasonMap[jobId]?.trim();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiClient.archiveJob(companyId, jobId, reason);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSuccessMsg(`Job '${updated.title}' archived.`);
      setArchiveReasonMap((prev) => ({ ...prev, [jobId]: '' }));
    } catch (err: any) {
      setError(err.message || 'Archive failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (activeTab === 'all') return true;
    return j.status === activeTab;
  });

  const isVerified = verificationStatus === 'verified';

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'draft': return <Badge variant="outline">Draft</Badge>;
      case 'pending_approval': return <Badge variant="warning">Pending Approval</Badge>;
      case 'published': return <Badge variant="success">Published</Badge>;
      case 'paused': return <Badge variant="warning">Paused</Badge>;
      case 'closed': return <Badge variant="danger">Closed</Badge>;
      case 'archived': return <Badge variant="outline">Archived</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (initialLoading) {
    return <div className="p-4 text-slate-500 text-sm">Loading Job Posting Manager...</div>;
  }

  return (
    <div className="space-y-6" data-testid="job-posting-manager">
      {/* Unverified Company Alert */}
      {!isVerified && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 text-amber-800 dark:text-amber-200 text-sm space-y-1" data-testid="unverified-company-warning">
          <p className="font-semibold">🟡 Company Unverified</p>
          <p className="text-xs">
            Publishing and resuming job postings is restricted until your company is verified by Platform Admin. You can still create and edit draft jobs.
          </p>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200 flex items-center justify-between" data-testid="job-manager-error">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadData} className="ml-4 border-red-300 text-red-800 hover:bg-red-100" data-testid="retry-load-btn">
            Retry
          </Button>
        </div>
      )}
      {catalogError && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs border border-amber-200 flex items-center justify-between" data-testid="job-manager-catalog-warning">
          <span>{catalogError}</span>
          <Button variant="outline" size="sm" onClick={loadData} className="ml-2 text-xs" data-testid="retry-catalog-btn">
            Retry Catalog
          </Button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200" data-testid="job-manager-success">
          {successMsg}
        </div>
      )}

      {/* Approval Settings Panel (Owner/Admin) */}
      <Card data-testid="approval-settings-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Job Posting Approval Settings</CardTitle>
              <CardDescription className="text-xs">Configure whether HR job postings require Owner/Admin approval before going live.</CardDescription>
            </div>
            {isOwnerOrAdmin && (
              <Button variant="outline" size="sm" onClick={handleToggleApprovalSetting} disabled={loading} data-testid="toggle-approval-setting-btn">
                {loading ? 'Updating...' : settings?.job_approval_required ? 'Switch to Direct Publish' : 'Require Approval'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm pt-0">
          <p className="text-slate-600 dark:text-slate-300">
            Current Policy: {' '}
            <span className="font-semibold" data-testid="approval-policy-text">
              {settings?.job_approval_required
                ? 'APPROVAL REQUIRED (HR publishes move to Pending Approval)'
                : 'DIRECT PUBLISH (HR can publish directly to live site)'}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-xs flex-wrap">
          {['all', 'draft', 'pending_approval', 'published', 'paused', 'closed', 'archived'].map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
            >
              {tab.replace('_', ' ').toUpperCase()} ({tab === 'all' ? jobs.length : jobs.filter((j) => j.status === tab).length})
            </Button>
          ))}
        </div>
        <Button onClick={handleOpenCreateForm} data-testid="create-job-btn">
          + Create New Job Draft
        </Button>
      </div>

      {/* Job Create/Edit Form Modal/Section */}
      {isFormOpen && (
        <Card className="border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-slate-900" data-testid="job-form-card">
          <CardHeader>
            <CardTitle>{editingJobId ? 'Edit Job Draft' : 'Create New Job Draft'}</CardTitle>
            <CardDescription>Fill out the complete job details. Draft jobs can be saved and published later.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveJob} className="space-y-6 text-sm">
              {/* Section 1: Basic Identification */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">1. Basic Identification</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-xs mb-1">Job Title *</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="e.g. Senior Fullstack Developer"
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-title"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">URL Slug * (lowercase, hyphens only)</label>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="e.g. senior-fullstack-developer"
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-slug"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Job Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-job-category"
                    >
                      {dbCategories.length > 0 ? (
                        dbCategories.map((cat) => (
                          <option key={cat.id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Engineering">Engineering</option>
                          <option value="Product">Product</option>
                          <option value="Design">Design</option>
                          <option value="Marketing">Marketing</option>
                          <option value="Sales">Sales</option>
                          <option value="Human Resources">Human Resources</option>
                          <option value="Finance">Finance</option>
                          <option value="Operations">Operations</option>
                          <option value="Customer Support">Customer Support</option>
                          <option value="Data & Analytics">Data & Analytics</option>
                          <option value="Legal">Legal</option>
                          <option value="Other">Other</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Work Setup & Experience */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">2. Work Setup, Shift & Education Requirements</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-xs mb-1">Employment Type</label>
                    <select
                      value={employmentType}
                      onChange={(e) => setEmploymentType(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-employment-type"
                    >
                      <option value="full_time">Full Time</option>
                      <option value="part_time">Part Time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                      <option value="freelance">Freelance</option>
                      <option value="temporary">Temporary</option>
                      <option value="volunteer">Volunteer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Work Mode</label>
                    <select
                      value={workMode}
                      onChange={(e) => setWorkMode(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-work-mode"
                    >
                      <option value="onsite">Onsite (Office)</option>
                      <option value="remote">Remote (WFH)</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Shift Timing</label>
                    <select
                      value={workShift}
                      onChange={(e) => setWorkShift(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-work-shift"
                    >
                      <option value="day">Day Shift</option>
                      <option value="night">Night Shift</option>
                      <option value="rotational">Rotational Shift</option>
                      <option value="flexible">Flexible Shift</option>
                      <option value="us_shift">US Shift</option>
                      <option value="uk_shift">UK Shift</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Max Notice Period</label>
                    <select
                      value={maxNoticePeriodDays}
                      onChange={(e) => setMaxNoticePeriodDays(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-max-notice-period"
                    >
                      <option value="">Any / No Restriction</option>
                      <option value="0">Immediate Joiners Only (0 Days)</option>
                      <option value="15">Max 15 Days</option>
                      <option value="30">Max 30 Days (1 Month)</option>
                      <option value="60">Max 60 Days (2 Months)</option>
                      <option value="90">Max 90 Days (3 Months)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                  <div>
                    <label className="block font-medium text-xs mb-1">Min Exp (Years)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="e.g. 5"
                      value={experienceMin}
                      onChange={(e) => setExperienceMin(e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value))))}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-experience-min"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Max Exp (Years)</label>
                    <input
                      type="number"
                      min={experienceMin !== '' ? Number(experienceMin) : 0}
                      placeholder="e.g. 12"
                      value={experienceMax}
                      onChange={(e) => setExperienceMax(e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value))))}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-experience-max"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Education Stream</label>
                    <select
                      value={educationType}
                      onChange={(e) => setEducationType(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-education-type"
                    >
                      <option value="any">Any Stream (Technical / Non-Technical)</option>
                      <option value="technical">Technical (Engineering, CS, IT, MCA, etc.)</option>
                      <option value="non_technical">Non-Technical (Arts, Commerce, Management, etc.)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Min Qualification</label>
                    <select
                      value={minEducationLevel}
                      onChange={(e) => setMinEducationLevel(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-min-education-level"
                    >
                      <option value="unspecific">Unspecified / Any Degree</option>
                      <option value="high_school">High School / 10th / 12th</option>
                      <option value="diploma">
                        {educationType === 'technical'
                          ? 'Diploma / Polytechnic / ITI'
                          : educationType === 'non_technical'
                          ? 'Diploma / Vocational'
                          : 'Diploma / Vocational'}
                      </option>
                      <option value="bachelors">
                        {educationType === 'technical'
                          ? "Bachelor's Degree (B.Tech, B.E, B.Sc CS, BCA, etc.)"
                          : educationType === 'non_technical'
                          ? "Bachelor's Degree (B.A, B.Com, BBA, B.Sc, etc.)"
                          : "Bachelor's Degree (B.Tech, B.A, B.Com, B.Sc, etc.)"}
                      </option>
                      <option value="masters">
                        {educationType === 'technical'
                          ? "Master's Degree (M.Tech, M.E, M.Sc CS, MCA, etc.)"
                          : educationType === 'non_technical'
                          ? "Master's Degree (M.A, M.Com, MBA, M.Sc, etc.)"
                          : "Master's Degree (M.Tech, M.A, MBA, MCA, etc.)"}
                      </option>
                      <option value="doctorate">Doctorate / Ph.D.</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Vacancies</label>
                    <input
                      type="number"
                      min={1}
                      value={vacancies}
                      onChange={(e) => setVacancies(Number(e.target.value))}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-vacancies"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Location & Remote */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">3. Primary & Multi-City Locations</h4>
                  <button
                    type="button"
                    onClick={handleAddLocation}
                    className="text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded font-medium transition"
                    data-testid="btn-add-location"
                  >
                    + Add Another City
                  </button>
                </div>

                <div className="text-xs text-slate-500 font-medium">Primary Office / Location:</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-xs mb-1">City (Primary)</label>
                    {!isCustomPrimaryCity && (locationCity === '' || dbCities.some((c) => c.name.toLowerCase() === locationCity.trim().toLowerCase())) && dbCities.length > 0 ? (
                      <select
                        value={locationCity}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__OTHER__') {
                            setIsCustomPrimaryCity(true);
                            setLocationCity('');
                          } else {
                            setLocationCity(val);
                            const found = dbCities.find((c) => c.name.toLowerCase() === val.toLowerCase());
                            if (found) {
                              if (found.state) setLocationState(found.state);
                              if (found.country) setLocationCountry(found.country);
                            }
                          }
                        }}
                        className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                        data-testid="select-location-city"
                      >
                        <option value="">-- Select Master City --</option>
                        {dbCities.map((c) => (
                          <option key={c.id || c.name} value={c.name}>
                            {c.name} {c.state ? `(${c.state})` : ''}
                          </option>
                        ))}
                        <option value="__OTHER__">+ Add Other City (Custom)...</option>
                      </select>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={locationCity}
                          onChange={(e) => setLocationCity(e.target.value)}
                          placeholder="e.g. Kharadi"
                          className="w-full p-2 border border-indigo-300 dark:border-indigo-700 rounded dark:bg-slate-900 text-sm"
                          data-testid="input-location-city"
                        />
                        {dbCities.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsCustomPrimaryCity(false)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 underline font-medium"
                          >
                            ← Select from Master Cities
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block font-medium text-xs mb-1">State</label>
                    <input
                      type="text"
                      value={locationState}
                      onChange={(e) => setLocationState(e.target.value)}
                      placeholder="e.g. Maharashtra"
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-location-state"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-xs mb-1">Country</label>
                    <input
                      type="text"
                      value={locationCountry}
                      onChange={(e) => setLocationCountry(e.target.value)}
                      placeholder="e.g. India"
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-location-country"
                    />
                  </div>
                </div>

                {additionalLocations.length > 0 && (
                  <div className="space-y-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 font-medium">Additional Hiring Cities:</div>
                    {additionalLocations.map((loc, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                        <div className="md:col-span-2">
                          {dbCities.length > 0 && !loc.isCustom && (loc.city === '' || dbCities.some((c) => c.name.toLowerCase() === loc.city.trim().toLowerCase())) ? (
                            <select
                              value={loc.city}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__OTHER__') {
                                  handleLocationChange(idx, 'isCustom' as any, true as any);
                                  handleLocationChange(idx, 'city', '');
                                } else {
                                  handleLocationChange(idx, 'city', val);
                                  const found = dbCities.find((c) => c.name.toLowerCase() === val.toLowerCase());
                                  if (found) {
                                    if (found.state) handleLocationChange(idx, 'state', found.state);
                                    if (found.country) handleLocationChange(idx, 'country', found.country);
                                  }
                                }
                              }}
                              className="w-full p-1.5 border rounded dark:bg-slate-900 text-xs"
                            >
                              <option value="">-- Select City --</option>
                              {dbCities.map((c) => (
                                <option key={c.id || c.name} value={c.name}>
                                  {c.name} {c.state ? `(${c.state})` : ''}
                                </option>
                              ))}
                              <option value="__OTHER__">+ Add Other City (Custom)...</option>
                            </select>
                          ) : (
                            <div>
                              <input
                                type="text"
                                placeholder="Custom City Name"
                                value={loc.city}
                                onChange={(e) => handleLocationChange(idx, 'city', e.target.value)}
                                className="w-full p-1.5 border border-indigo-300 rounded dark:bg-slate-900 text-xs"
                              />
                              {dbCities.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleLocationChange(idx, 'isCustom' as any, false as any)}
                                  className="text-[9px] text-indigo-600 underline"
                                >
                                  ← Select from Master Cities
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <input
                            type="text"
                            placeholder="State (e.g. Maharashtra)"
                            value={loc.state}
                            onChange={(e) => handleLocationChange(idx, 'state', e.target.value)}
                            className="w-full p-1.5 border rounded dark:bg-slate-900 text-xs"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <input
                            type="text"
                            placeholder="Country (e.g. India)"
                            value={loc.country}
                            onChange={(e) => handleLocationChange(idx, 'country', e.target.value)}
                            className="w-full p-1.5 border rounded dark:bg-slate-900 text-xs"
                          />
                        </div>
                        <div className="md:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveLocation(idx)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Compensation & Salary */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">4. Compensation & Salary Range</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-xs mb-1">Min Salary</label>
                    <input
                      type="number"
                      value={salaryMin}
                      onChange={(e) => setSalaryMin(e.target.value)}
                      placeholder="e.g. 1200000"
                      className="w-full p-2 border rounded dark:bg-slate-900"
                      data-testid="input-salary-min"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Max Salary</label>
                    <input
                      type="number"
                      value={salaryMax}
                      onChange={(e) => setSalaryMax(e.target.value)}
                      placeholder="e.g. 1800000"
                      className="w-full p-2 border rounded dark:bg-slate-900"
                      data-testid="input-salary-max"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Currency</label>
                    <select
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-salary-currency"
                    >
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Period</label>
                    <select
                      value={salaryPeriod}
                      onChange={(e) => setSalaryPeriod(e.target.value)}
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="select-salary-period"
                    >
                      <option value="yearly">Per Year (Yearly)</option>
                      <option value="monthly">Per Month (Monthly)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="salary_visible"
                    checked={salaryVisible}
                    onChange={(e) => setSalaryVisible(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                    data-testid="checkbox-salary-visible"
                  />
                  <label htmlFor="salary_visible" className="text-xs font-medium cursor-pointer">
                    Show Salary Range publicly on Job Listing
                  </label>
                </div>
              </div>

              {/* Section 5: Content, Responsibilities & Benefits */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">5. Detailed Content & Qualifications</h4>
                <div>
                  <label className="block font-medium text-xs mb-1">Job Description *</label>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed job summary, overview, and mission..."
                    className="w-full p-2 border rounded dark:bg-slate-900"
                    data-testid="input-job-description"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-xs mb-1">Key Responsibilities</label>
                    <textarea
                      rows={3}
                      value={responsibilities}
                      onChange={(e) => setResponsibilities(e.target.value)}
                      placeholder="Bullet points of daily duties and responsibilities..."
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-responsibilities"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Mandatory Requirements</label>
                    <textarea
                      rows={3}
                      value={requirements}
                      onChange={(e) => setRequirements(e.target.value)}
                      placeholder="e.g. B.Tech/MCA degree, 3+ years experience, strong problem solving..."
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-requirements"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Preferred Qualifications (Optional)</label>
                    <textarea
                      rows={3}
                      value={preferredQualifications}
                      onChange={(e) => setPreferredQualifications(e.target.value)}
                      placeholder="e.g. AWS certification, Docker/Kubernetes experience, open source contributions..."
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-preferred-qualifications"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-xs mb-1">Perks & Benefits</label>
                    <textarea
                      rows={3}
                      value={benefits}
                      onChange={(e) => setBenefits(e.target.value)}
                      placeholder="Health insurance, WFH setup, ESOPs, learning allowance..."
                      className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                      data-testid="input-job-benefits"
                    />
                  </div>
                </div>
              </div>

              {/* Section 6: Key Tech Stack & Skills Tag Selection */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">6. Required Tech Stack & Master Skills</h4>
                <div className="text-xs text-slate-500 mb-1">Click to select skills from catalog or type a custom skill below:</div>

                {/* Catalog Skills Selection Box */}
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded bg-slate-50 dark:bg-slate-900/50">
                  {dbSkills.length > 0 &&
                    dbSkills.map((sk) => {
                      const isSelected = selectedSkillIds.includes(sk.id);
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          onClick={() => toggleSkillSelect(sk.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition font-medium ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          {isSelected ? `✓ ${sk.name}` : sk.name}
                        </button>
                      );
                    })}
                </div>

                {/* Dedicated Custom Skills Section (Prominently displayed) */}
                {customSkills.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Custom Added Skills ({customSkills.length}):</div>
                    <div className="flex flex-wrap gap-2 p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
                      {customSkills.map((cSk) => (
                        <span
                          key={cSk}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white font-medium shadow-sm"
                        >
                          ✓ {cSk}
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomSkill(cSk)}
                            className="hover:text-emerald-200 ml-0.5 font-bold text-sm leading-none"
                            title="Remove custom skill"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Custom Skill Input */}
                {skillNotice && (
                  <div
                    role="status"
                    data-testid="custom-skill-notice"
                    className={`text-xs font-medium ${skillNotice.kind === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}
                  >
                    {skillNotice.message}
                  </div>
                )}
                <div className="flex gap-2 items-center pt-1">
                  <input
                    type="text"
                    placeholder="Can't find a skill? Add custom (e.g. Bun, Mojo, Qdrant)..."
                    value={customSkillInput}
                    onChange={(e) => setCustomSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSkill();
                      }
                    }}
                    className="p-1.5 border rounded dark:bg-slate-900 text-xs w-72"
                    data-testid="input-custom-skill"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSkill}
                    className="text-xs px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white rounded hover:bg-slate-900 font-medium transition"
                    data-testid="btn-add-custom-skill"
                  >
                    + Add Skill
                  </button>
                </div>

                {(selectedSkillIds.length > 0 || customSkills.length > 0) && (
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    {selectedSkillIds.length + customSkills.length} total skills tagged for candidate matching.
                  </div>
                )}
              </div>

              {/* Section 7: Phases of Interview & Hiring Process */}
              <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">7. Phases of Interview & Hiring Process</h4>
                  <button
                    type="button"
                    onClick={handleAddInterviewRound}
                    className="text-xs px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded font-medium transition"
                    data-testid="btn-add-interview-round"
                  >
                    + Add Interview Round
                  </button>
                </div>
                <p className="text-xs text-slate-500">Define the interview pipeline stages for candidate guidance and tracking.</p>

                {interviewRounds.length === 0 ? (
                  <div className="text-xs text-slate-400 italic p-2 border border-dashed rounded text-center">
                    No interview rounds added yet. Click &quot;+ Add Interview Round&quot; to specify hiring rounds.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {interviewRounds.map((round, idx) => (
                      <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded border border-slate-200 dark:border-slate-800">
                        <div className="md:col-span-1 font-bold text-xs text-indigo-600 dark:text-indigo-400">
                          Round {idx + 1}
                        </div>
                        <div className="md:col-span-4">
                          <input
                            type="text"
                            placeholder="e.g. HR Screening, Technical Round 1"
                            value={round.name}
                            onChange={(e) => handleInterviewRoundChange(idx, 'name', e.target.value)}
                            className="w-full p-1.5 border rounded dark:bg-slate-900 text-xs"
                            data-testid={`input-round-name-${idx}`}
                          />
                        </div>
                        <div className="md:col-span-6">
                          <input
                            type="text"
                            placeholder="Description/Focus (e.g. Data Structures, System Design)"
                            value={round.description || ''}
                            onChange={(e) => handleInterviewRoundChange(idx, 'description', e.target.value)}
                            className="w-full p-1.5 border rounded dark:bg-slate-900 text-xs"
                            data-testid={`input-round-desc-${idx}`}
                          />
                        </div>
                        <div className="md:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveInterviewRound(idx)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
                            data-testid={`btn-remove-round-${idx}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 8: Settings, Flags & Masking */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">8. Job Flags & Privacy Settings</h4>
                <div className="flex flex-wrap gap-6 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConfidential}
                      onChange={(e) => setIsConfidential(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                      data-testid="checkbox-is-confidential"
                    />
                    <span>🔒 Confidential Employer (Mask company identity as &quot;Confidential Employer&quot;)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={(e) => setIsUrgent(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600"
                      data-testid="checkbox-is-urgent"
                    />
                    <span>⚡ Urgent Hiring Badge</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFeatured}
                      onChange={(e) => setIsFeatured(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600"
                      data-testid="checkbox-is-featured"
                    />
                    <span>⭐ Featured Job Listing</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button type="submit" disabled={loading} data-testid="save-job-btn">
                  {loading ? 'Saving...' : editingJobId ? 'Save Changes' : 'Create Draft'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <Card className="p-8 text-center text-slate-500 text-sm" data-testid="empty-jobs-card">
          No jobs found matching the selected filter ({activeTab}).
        </Card>
      ) : (
        <div className="space-y-4" data-testid="job-list">
          {filteredJobs.map((job) => (
            <Card key={job.id} data-testid={`job-card-${job.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg font-bold">{job.title}</CardTitle>
                      {getStatusBadge(job.status)}
                    </div>
                    <CardDescription className="text-xs mt-1">
                      Slug: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{job.slug}</code> | ID: {job.id}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-slate-600 dark:text-slate-300 line-clamp-2 text-xs">{job.description}</p>

                {/* Rejection Reason Alert Banner */}
                {job.status === 'draft' && job.rejection_reason && (
                  <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs space-y-1" data-testid={`rejection-reason-banner-${job.id}`}>
                    <p className="font-bold flex items-center gap-1.5 text-red-800 dark:text-red-200">
                      <span>❌ Approval Rejected by Owner/Admin</span>
                    </p>
                    <p className="text-slate-700 dark:text-slate-300 text-xs pl-2 border-l-2 border-red-400 dark:border-red-600 italic">
                      &quot;{job.rejection_reason}&quot;
                    </p>
                  </div>
                )}

                {/* Render Job Skills & Custom Skills Pills on Job Card */}
                {((job.skills && job.skills.length > 0) || (job.custom_skills && Array.isArray(job.custom_skills) && job.custom_skills.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {job.skills?.map((s) => (
                      <span key={s.skill_id || s.id} className="text-[11px] px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                        {s.skill_name || s.skill_id}
                      </span>
                    ))}
                    {job.custom_skills?.map((cSk) => (
                      <span key={cSk} className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                        ✓ {cSk} (Custom)
                      </span>
                    ))}
                  </div>
                )}

                {/* Status & Lifecycle Actions */}
                <div className="pt-2 border-t flex flex-wrap items-center gap-2">
                  {/* DRAFT Actions */}
                  {job.status === 'draft' && (
                    <>
                      {isOwnerOrAdmin || !settings?.job_approval_required ? (
                        <Button size="sm" onClick={() => handlePublish(job.id)} disabled={loading} data-testid={`publish-btn-${job.id}`}>
                          Publish Job
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleSubmitForApproval(job.id)} disabled={loading} data-testid={`submit-approval-btn-${job.id}`}>
                          Submit for Approval
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleOpenEditForm(job)} data-testid={`edit-btn-${job.id}`}>
                        Edit Draft
                      </Button>
                    </>
                  )}

                  {/* PENDING APPROVAL Actions */}
                  {job.status === 'pending_approval' && (
                    <>
                      {isOwnerOrAdmin ? (
                        <>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(job.id)} disabled={loading} data-testid={`approve-btn-${job.id}`}>
                            Approve & Publish
                          </Button>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Reason for rejection..."
                              value={rejectReasonMap[job.id] || ''}
                              onChange={(e) => setRejectReasonMap((prev) => ({ ...prev, [job.id]: e.target.value }))}
                              className="p-1 text-xs border rounded dark:bg-slate-900 w-44"
                              data-testid={`reject-reason-input-${job.id}`}
                            />
                            <Button size="sm" variant="danger" onClick={() => handleReject(job.id)} disabled={loading} data-testid={`reject-btn-${job.id}`}>
                              Reject
                            </Button>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950 p-1.5 rounded border border-amber-200">
                          ⏳ Pending Owner/Admin Approval
                        </span>
                      )}
                    </>
                  )}

                  {/* PUBLISHED Actions */}
                  {job.status === 'published' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handlePause(job.id)} disabled={loading} data-testid={`pause-btn-${job.id}`}>
                        Pause Job
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleClose(job.id)} disabled={loading} data-testid={`close-btn-${job.id}`}>
                        Close Job
                      </Button>
                    </>
                  )}

                  {/* PAUSED Actions */}
                  {job.status === 'paused' && (
                    <>
                      <Button size="sm" onClick={() => handleResume(job.id)} disabled={loading} data-testid={`resume-btn-${job.id}`}>
                        Resume Job
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleClose(job.id)} disabled={loading} data-testid={`close-btn-${job.id}`}>
                        Close Job
                      </Button>
                    </>
                  )}

                  {/* CLOSED Actions */}
                  {job.status === 'closed' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Archive reason (optional)..."
                        value={archiveReasonMap[job.id] || ''}
                        onChange={(e) => setArchiveReasonMap((prev) => ({ ...prev, [job.id]: e.target.value }))}
                        className="p-1 text-xs border rounded dark:bg-slate-900 w-44"
                        data-testid={`archive-reason-input-${job.id}`}
                      />
                      <Button size="sm" variant="outline" onClick={() => handleArchive(job.id)} disabled={loading} data-testid={`archive-btn-${job.id}`}>
                        Archive Job
                      </Button>
                    </div>
                  )}

                  {/* ARCHIVED Actions */}
                  {job.status === 'archived' && (
                    <span className="text-xs text-slate-500 italic">
                      Terminal state (Archived)
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
