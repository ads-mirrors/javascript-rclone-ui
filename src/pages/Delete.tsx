import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Accordion, AccordionItem, Alert, Avatar, Button } from '@heroui/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import cronstrue from 'cronstrue'
import {
    AlertOctagonIcon,
    ClockIcon,
    FilterIcon,
    FoldersIcon,
    PlayIcon,
    WrenchIcon,
    XIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getRemoteName } from '../../lib/format'
import {
    getConfigFlags,
    getCurrentGlobalFlags,
    getFilterFlags,
    getRemote,
    startDelete,
} from '../../lib/rclone/api'
import { RCLONE_CONFIG_DEFAULTS } from '../../lib/rclone/constants'
import { usePersistedStore } from '../../lib/store'
import CronEditor from '../components/CronEditor'
import OptionsSection from '../components/OptionsSection'
import { PathField } from '../components/PathFinder'
import TemplatesDropdown from '../components/TemplatesDropdown'

const SUPPORTS_PURGE = [
    'box',
    'dropbox',
    'gcs',
    'drive',
    'azureblob',
    'onedrive',
    'protondrive',
    'webdav',
    'netstorage',
    'sharefile',
    'filescom',
    'gofile',
    'hdfs',
    'hifile',
    'imagekit',
    'jottacloud',
    'koofr',
    'mailru',
    'mega',
    'swift',
    'pikpak',
    'pcloud',
    'pixeldrain',
    'putio',
    'premiumizeme',
    'quatrix',
    'seafile',
    'sugarsync',
    'storj',
    'webdav',
    'yandex',
    'zoho',
]

export default function Delete() {
    const [searchParams] = useSearchParams()

    const [sourceFs, setSourceFs] = useState<string | undefined>(
        searchParams.get('initialSource') ? searchParams.get('initialSource')! : undefined
    )
    // @ts-ignore
    const [rmDirs, setRmDirs] = useState(false)

    const [cronExpression, setCronExpression] = useState<string | null>(null)

    const [isStarted, setIsStarted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [jsonError, setJsonError] = useState<'filter' | 'config' | null>(null)

    const [filterOptionsLocked, setFilterOptionsLocked] = useState(false)
    const [filterOptions, setFilterOptions] = useState<Record<string, string>>({})
    const [filterOptionsJson, setFilterOptionsJson] = useState<string>('{}')

    const [configOptionsLocked, setConfigOptionsLocked] = useState(false)
    const [configOptions, setConfigOptions] = useState<Record<string, string>>({})
    const [configOptionsJson, setConfigOptionsJson] = useState<string>('{}')

    const [currentGlobalOptions, setCurrentGlobalOptions] = useState<any[]>([])

    const [supportsPurge, setSupportsPurge] = useState(false)
    const [animationParent] = useAutoAnimate()

    const sourceRemoteName = getRemoteName(sourceFs)

    // biome-ignore lint/correctness/useExhaustiveDependencies: when unlocking, we don't want to re-run the effect
    useEffect(() => {
        const storeData = usePersistedStore.getState()

        let mergedFilterDefaults = {}
        let mergedConfigDefaults = {}

        // Helper function to merge defaults from a remote
        const mergeRemoteDefaults = (remote: string | null) => {
            if (!remote) return

            const remoteConfig = storeData.remoteConfigList?.[remote] || {}

            if (remoteConfig.filterDefaults) {
                mergedFilterDefaults = {
                    ...mergedFilterDefaults,
                    ...remoteConfig.filterDefaults,
                }
            }

            if (remoteConfig.configDefaults) {
                mergedConfigDefaults = {
                    ...mergedConfigDefaults,
                    ...remoteConfig.configDefaults,
                }
            } else {
                mergedConfigDefaults = {
                    ...mergedConfigDefaults,
                    ...RCLONE_CONFIG_DEFAULTS,
                }
            }
        }

        // Only merge defaults for remote paths
        if (sourceRemoteName) mergeRemoteDefaults(sourceRemoteName)

        if (Object.keys(mergedFilterDefaults).length > 0 && !filterOptionsLocked) {
            setFilterOptionsJson(JSON.stringify(mergedFilterDefaults, null, 2))
        }

        if (Object.keys(mergedConfigDefaults).length > 0 && !configOptionsLocked) {
            setConfigOptionsJson(JSON.stringify(mergedConfigDefaults, null, 2))
        }
    }, [sourceRemoteName])

    useEffect(() => {
        if (!sourceRemoteName) return
        getRemote(sourceRemoteName).then((remote) =>
            setSupportsPurge(SUPPORTS_PURGE.includes(remote.type))
        )
    }, [sourceRemoteName])

    useEffect(() => {
        getCurrentGlobalFlags().then((flags) => setCurrentGlobalOptions(flags))
    }, [])

    useEffect(() => {
        let step: 'filter' | 'config' = 'filter'
        try {
            setFilterOptions(JSON.parse(filterOptionsJson))

            step = 'config'
            setConfigOptions(JSON.parse(configOptionsJson))

            setJsonError(null)
        } catch (error) {
            setJsonError(step)
            console.error(`Error parsing ${step} options:`, error)
        }
    }, [filterOptionsJson, configOptionsJson])

    async function handleStartDelete() {
        setIsLoading(true)

        if (!sourceFs) {
            await message('Please select a source path', {
                title: 'Error',
                kind: 'error',
            })
            setIsLoading(false)
            return
        }

        if (cronExpression) {
            try {
                cronstrue.toString(cronExpression)
            } catch {
                await message('Invalid cron expression', {
                    title: 'Error',
                    kind: 'error',
                })
                setIsLoading(false)
                return
            }
            usePersistedStore.getState().addScheduledTask({
                type: 'delete',
                cron: cronExpression,
                args: {
                    fs: sourceFs,
                    rmDirs: rmDirs,
                    _filter: filterOptions,
                    _config: configOptions,
                },
            })
        }

        try {
            await startDelete({
                fs: sourceFs,
                rmDirs,
                _filter: filterOptions,
                _config: configOptions,
            })

            setIsStarted(true)

            await message('Delete job started', {
                title: 'Success',
                okLabel: 'OK',
            })
            setIsLoading(false)
        } catch (error) {
            await message(`Failed to start delete job, ${error}`, {
                title: 'Error',
                kind: 'error',
                okLabel: 'OK',
            })
            setIsLoading(false)
        }
    }

    async function handleAddToTemplates(name: string) {
        if (!!jsonError || !sourceFs) {
            await message('Your config for this operation is incomplete or has errors.', {
                title: 'Error',
                kind: 'error',
            })
            return
        }
        const templates = usePersistedStore.getState().templates

        const mergedOptions = {
            filterOptions,
            configOptions,
            sourceFs,
            rmDirs,
        }

        const newTemplates = [
            ...templates,
            {
                id: Math.floor(Date.now() / 1000).toString(),
                name,
                operation: 'delete',
                options: mergedOptions,
            } as const,
        ]

        usePersistedStore.setState({ templates: newTemplates })
    }

    async function handleSelectTemplate(templateId: string) {
        const template = usePersistedStore
            .getState()
            .templates.find((template) => template.id === templateId)

        if (!template) {
            await message('Template not found', {
                title: 'Error',
                kind: 'error',
            })
            return
        }

        setFilterOptions(template.options.filterOptions)
        setConfigOptions(template.options.configOptions)
        setSourceFs(template.options.sourceFs)
        setRmDirs(template.options.rmDirs)
    }

    const buttonText = (() => {
        if (isLoading) return 'STARTING...'
        if (!sourceFs || sourceFs.length === 0) return 'Please select a source path'
        if (jsonError) return 'Invalid JSON for ' + jsonError.toUpperCase() + ' options'
        return 'START DELETE'
    })()

    const buttonIcon = (() => {
        if (isLoading) return
        if (!sourceFs || sourceFs.length === 0) return <FoldersIcon className="w-5 h-5" />
        if (jsonError) return <AlertOctagonIcon className="w-5 h-5" />
        return <PlayIcon className="w-5 h-5 fill-current" />
    })()

    return (
        <div className="flex flex-col h-screen gap-10 pt-10">
            {/* Main Content */}
            <div
                className="flex flex-col flex-1 w-full max-w-3xl gap-6 mx-auto"
                ref={animationParent}
            >
                {/* Path Display */}
                <PathField
                    path={sourceFs || ''}
                    setPath={setSourceFs}
                    label="Path"
                    placeholder="Enter a remote:/path to delete"
                    showPicker={true}
                    allowedKeys={['REMOTES', 'FAVORITES']}
                    showFiles={true}
                />

                {/* <div className="flex flex-col gap-2 pt-2 -mb-5">
                    <Switch isSelected={rmDirs} onValueChange={setRmDirs}>
                        Delete empty source directories after delete
                    </Switch>
                </div> */}

                {supportsPurge && (
                    <Alert
                        color="primary"
                        title="LET ME SHARE A TIP"
                        variant="faded"
                        className="min-h-none h-fit max-h-fit"
                    >
                        If you're deleting a entire folder, "{sourceRemoteName}" supports Purge
                        which is more efficient!
                    </Alert>
                )}

                <Accordion>
                    <AccordionItem
                        key="filters"
                        startContent={
                            <Avatar color="danger" radius="lg" fallback={<FilterIcon />} />
                        }
                        indicator={<FilterIcon />}
                        subtitle="Tap to toggle filtering options for this operation"
                        title="Filters"
                    >
                        <OptionsSection
                            globalOptions={
                                currentGlobalOptions['filter' as keyof typeof currentGlobalOptions]
                            }
                            optionsJson={filterOptionsJson}
                            setOptionsJson={setFilterOptionsJson}
                            getAvailableOptions={getFilterFlags}
                            isLocked={filterOptionsLocked}
                            setIsLocked={setFilterOptionsLocked}
                        />
                    </AccordionItem>
                    <AccordionItem
                        key="config"
                        startContent={
                            <Avatar color="default" radius="lg" fallback={<WrenchIcon />} />
                        }
                        indicator={<WrenchIcon />}
                        subtitle="Tap to toggle config options for this operation"
                        title="Config"
                    >
                        <OptionsSection
                            globalOptions={
                                currentGlobalOptions['main' as keyof typeof currentGlobalOptions]
                            }
                            optionsJson={configOptionsJson}
                            setOptionsJson={setConfigOptionsJson}
                            getAvailableOptions={getConfigFlags}
                            isLocked={configOptionsLocked}
                            setIsLocked={setConfigOptionsLocked}
                        />
                    </AccordionItem>
                    <AccordionItem
                        key="cron"
                        startContent={
                            <Avatar color="warning" radius="lg" fallback={<ClockIcon />} />
                        }
                        indicator={<ClockIcon />}
                        subtitle="Tap to toggle cron options for this operation"
                        title="Cron"
                    >
                        <CronEditor expression={cronExpression} onChange={setCronExpression} />
                    </AccordionItem>
                </Accordion>
            </div>

            <div className="sticky bottom-0 z-50 flex items-center justify-center flex-none gap-2 p-4 border-t border-neutral-500/20 bg-neutral-900/50 backdrop-blur-lg">
                <TemplatesDropdown
                    operation="delete"
                    onSelect={handleSelectTemplate}
                    onAdd={handleAddToTemplates}
                />
                {isStarted ? (
                    <>
                        <Button
                            fullWidth={true}
                            size="lg"
                            onPress={() => {
                                setFilterOptionsJson('{}')
                                setSourceFs(undefined)
                                setIsStarted(false)
                            }}
                            data-focus-visible="false"
                        >
                            RESET
                        </Button>

                        <Button
                            size="lg"
                            isIconOnly={true}
                            onPress={async () => {
                                await getCurrentWindow().hide()
                                await getCurrentWindow().destroy()
                            }}
                            data-focus-visible="false"
                        >
                            <XIcon />
                        </Button>
                    </>
                ) : (
                    <Button
                        onPress={handleStartDelete}
                        size="lg"
                        fullWidth={true}
                        type="button"
                        color="primary"
                        isDisabled={isLoading || !!jsonError || !sourceFs || sourceFs.length === 0}
                        isLoading={isLoading}
                        endContent={buttonIcon}
                        className="max-w-2xl gap-2"
                        data-focus-visible="false"
                    >
                        {buttonText}
                    </Button>
                )}
            </div>
        </div>
    )
}
