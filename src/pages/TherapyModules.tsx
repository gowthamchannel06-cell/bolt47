import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Brain, Heart, Moon, Headphones, Palette, Gamepad2,
  BookOpen, Music, Target, Users, Clock, Star,
  Play, Pause, RotateCcw, CheckCircle, Lock, ArrowLeft, Eye, Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { updateStreak } from '../utils/streakManager';
import { getAllTherapies } from '../utils/therapyStorage';
import { updateTherapyCompletion } from '../utils/therapyProgressManager';
import { Therapy } from '../types/therapy';
import { recordTherapyCompletion, getUserTherapyProgress } from '../utils/therapySessionManager';
import toast from 'react-hot-toast';

function TherapyModules() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [completedModules, setCompletedModules] = useState<string[]>([]);
  const [todaysDate, setTodaysDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [userProgress, setUserProgress] = useState<any>(null);
  const [therapies, setTherapies] = useState<Therapy[]>([]);
  const [therapySessionCounts, setTherapySessionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadTherapies();
    loadTherapySessionCounts();
    window.addEventListener('therapies-updated', loadTherapies);
    return () => window.removeEventListener('therapies-updated', loadTherapies);
  }, [user]);

  const loadTherapySessionCounts = async () => {
    if (!user?.id) return;

    const progressData = await getUserTherapyProgress(user.id);
    const counts: Record<string, number> = {};

    progressData.forEach(progress => {
      counts[progress.therapy_id] = progress.total_sessions_completed;
    });

    setTherapySessionCounts(counts);
  };

  useEffect(() => {
    const savedProgress = localStorage.getItem('mindcare_user_progress');
    if (savedProgress) {
      setUserProgress(JSON.parse(savedProgress));

      const currentDate = new Date().toISOString().split('T')[0];
      const progress = JSON.parse(savedProgress);

      if (!progress.lastResetDate || progress.lastResetDate !== currentDate) {
        const resetProgress = {
          ...progress,
          lastResetDate: currentDate,
          dailyCompletions: {
            ...progress.dailyCompletions,
            [currentDate]: []
          }
        };
        localStorage.setItem('mindcare_user_progress', JSON.stringify(resetProgress));
        setUserProgress(resetProgress);
        setCompletedModules([]);
      } else {
        const todaysCompletions = progress.dailyCompletions?.[currentDate] || [];
        setCompletedModules(todaysCompletions);
      }
    } else {
      const initialProgress = {
        lastResetDate: todaysDate,
        dailyCompletions: { [todaysDate]: [] }
      };
      localStorage.setItem('mindcare_user_progress', JSON.stringify(initialProgress));
      setUserProgress(initialProgress);
    }
  }, []);

  const loadTherapies = () => {
    setTherapies(getAllTherapies().filter(t => t.status === 'Active'));
  };

  const updateTherapyProgress = async (moduleId: string, moduleName: string) => {
    const currentDate = new Date().toISOString().split('T')[0];

    // Check if already completed today
    const todaysCompletions = userProgress?.dailyCompletions?.[currentDate] || [];
    if (todaysCompletions.includes(moduleId)) {
      // Already completed, don't add again
      return;
    }

    // Update streak
    updateStreak();

    // Record therapy completion in database with incremental session count
    if (user?.id) {
      const result = await recordTherapyCompletion(user.id, moduleId, moduleName);

      if (result.success) {
        // Update local session counts
        setTherapySessionCounts(prev => ({
          ...prev,
          [moduleId]: result.sessionNumber
        }));

        toast.success(`Session ${result.sessionNumber} completed!`);
      }

      // Update legacy progress tracking
      updateTherapyCompletion(user.id, moduleId);
    }

    if (userProgress?.currentPlan) {
      const existingCompletedTherapies = userProgress.completedTherapies || [];
      const updatedCompletedTherapies = existingCompletedTherapies.includes(moduleId)
        ? existingCompletedTherapies
        : [...existingCompletedTherapies, moduleId];

      const updatedProgress = {
        ...userProgress,
        completedTherapies: updatedCompletedTherapies,
        dailyCompletions: {
          ...userProgress.dailyCompletions,
          [currentDate]: [...todaysCompletions, moduleId]
        }
      };
      setUserProgress(updatedProgress);
      localStorage.setItem('mindcare_user_progress', JSON.stringify(updatedProgress));

      // Dispatch custom event for real-time updates
      window.dispatchEvent(new CustomEvent('mindcare-data-updated'));

      // Update local state
      setCompletedModules(prev => [...prev, moduleId]);
    } else {
      // If no current plan, just track daily completions
      const currentProgress = userProgress || { dailyCompletions: {} };
      const updatedProgress = {
        ...currentProgress,
        lastResetDate: currentDate,
        dailyCompletions: {
          ...currentProgress.dailyCompletions,
          [currentDate]: [...todaysCompletions, moduleId]
        }
      };
      setUserProgress(updatedProgress);
      localStorage.setItem('mindcare_user_progress', JSON.stringify(updatedProgress));

      // Dispatch custom event for real-time updates
      window.dispatchEvent(new CustomEvent('mindcare-data-updated'));

      // Update local state
      setCompletedModules(prev => [...prev, moduleId]);
    }
  };

  const routeMap: { [key: string]: string } = {
    'cbt': '/therapy-modules/cbt',
    'mindfulness': '/therapy-modules/mindfulness',
    'stress': '/therapy-modules/stress',
    'gratitude': '/therapy-modules/gratitude',
    'music': '/therapy-modules/music',
    'tetris': '/therapy-modules/tetris',
    'art': '/therapy-modules/art',
    'exposure': '/therapy-modules/exposure',
    'video': '/therapy-modules/video',
    'act': '/therapy-modules/act'
  };

  const getRouteForTherapy = (title: string): string => {
    const normalized = title.toLowerCase()
      .replace(/\s+&\s+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const titleKey = title.toLowerCase();
    if (titleKey.includes('cbt')) return '/therapy-modules/cbt';
    if (titleKey.includes('mindfulness')) return '/therapy-modules/mindfulness';
    if (titleKey.includes('stress')) return '/therapy-modules/stress';
    if (titleKey.includes('gratitude')) return '/therapy-modules/gratitude';
    if (titleKey.includes('music')) return '/therapy-modules/music';
    if (titleKey.includes('tetris')) return '/therapy-modules/tetris';
    if (titleKey.includes('art')) return '/therapy-modules/art';
    if (titleKey.includes('exposure')) return '/therapy-modules/exposure';
    if (titleKey.includes('video')) return '/therapy-modules/video';
    if (titleKey.includes('act') || titleKey.includes('acceptance')) return '/therapy-modules/act';

    return `/therapy-modules/${normalized}`;
  };

  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      Brain, Heart, Moon, Music, Palette, Gamepad2, BookOpen,
      Target, Users, Shield, Play, Star, Eye
    };
    return iconMap[iconName] || Brain;
  };

  const therapyModules = therapies.map((therapy) => ({
    id: therapy.id,
    moduleId: therapy.id,
    title: therapy.title,
    description: therapy.description,
    icon: getIconComponent(therapy.icon),
    color: therapy.color,
    duration: therapy.duration,
    difficulty: therapy.difficulty,
    sessions: therapy.sessions,
    route: getRouteForTherapy(therapy.title)
  }));

  const handleStartModule = (module: any) => {
    updateTherapyProgress(module.moduleId, module.title);
    navigate(module.route);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner':
        return 'bg-green-100 text-green-800';
      case 'Intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'Advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`h-screen flex flex-col ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-purple-50 via-blue-50 to-teal-50'
    }`}>
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className={`text-2xl font-bold mb-3 ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            Therapies
          </h1>
          <p className={`text-base mb-4 ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
          }`}>
            Evidence-based therapeutic approaches tailored to your needs
          </p>
          
          {/* Progress Overview */}
          <div className={`inline-flex items-center space-x-4 px-4 py-3 rounded-xl ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          } shadow-lg`}>
            <div className="text-center">
              <p className={`text-xl font-bold text-purple-500`}>
                {completedModules.length}
              </p>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Completed
              </p>
            </div>
            <div className="w-px h-6 bg-gray-300"></div>
            <div className="text-center">
              <p className={`text-xl font-bold text-blue-500`}>
                {Math.max(0, therapyModules.length - completedModules.length)}
              </p>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Available
              </p>
            </div>
            <div className="w-px h-6 bg-gray-300"></div>
            <div className="text-center">
              <p className={`text-xl font-bold text-teal-500`}>
                {therapyModules.length > 0 ? Math.min(100, Math.round((completedModules.length / therapyModules.length) * 100)) : 0}%
              </p>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Progress
              </p>
            </div>
          </div>
        </motion.div>

        {/* Modules Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {therapyModules.map((module, index) => (
            <motion.div
              key={module.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className={`relative p-4 rounded-xl shadow-lg cursor-pointer transition-all duration-300 ${
                theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:shadow-xl'
              }`}
              onClick={() => handleStartModule(module)}
            >
              {/* Completion Badge */}
              {completedModules.includes(module.moduleId) && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Module Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${module.color} flex items-center justify-center mb-3`}>
                <module.icon className="w-6 h-6 text-white" />
              </div>

              {/* Module Info */}
              <h3 className={`text-base font-semibold mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>
                {module.title}
              </h3>
              
              <p className={`text-xs mb-3 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {module.description}
              </p>

              {/* Module Details */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Clock className={`w-3 h-3 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <span className={`text-xs ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {module.duration}
                  </span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(module.difficulty)}`}>
                  {module.difficulty}
                </span>
              </div>

              {/* Progress Bar */}
              <div className={`w-full h-2 rounded-full mb-3 ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${module.color}`}
                  style={{ width: completedModules.includes(module.moduleId) ? '100%' : '0%' }}
                />
              </div>

              {/* Sessions Info */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold ${
                  theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                }`}>
                  {therapySessionCounts[module.moduleId] || 0} {therapySessionCounts[module.moduleId] === 1 ? 'session' : 'sessions'} completed
                </span>
                <div className="flex items-center space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-2 h-2 ${
                        i < 4 ? 'text-yellow-400 fill-current' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartModule(module);
                }}
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-300 text-sm font-medium"
              >
                <div className="flex items-center justify-center space-x-2">
                  <Play className="w-3 h-3" />
                  <span>Start Therapy</span>
                </div>
              </motion.button>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default TherapyModules;